import { supabase } from '../db/supabase';
import { GameData } from '../types/types';
import { fetchQuery } from "@airstack/node";
import axios from 'axios';

export async function startRegistrations() {
    const { data: gamesToStartRegistration, error: gamesToStartRegistrationError } = await supabase
        .from('games')
        .select('*')
        .eq('state', 'created')
        .lte('registration_start_date', new Date().toISOString());

    if (gamesToStartRegistrationError) {
        console.error("Error fetching games to start registration:", gamesToStartRegistrationError);
        throw gamesToStartRegistrationError;
    }

    await Promise.all(gamesToStartRegistration.map(game => startRegistration(game.id, game.game_start_date)));
}

export async function startReadyGames() {
    const { data: gamesToStart, error: gamesToStartError } = await supabase
        .from('games')
        .select('*')
        .lte('game_start_date', new Date().toISOString())  // Registration has ended
        .is('current_round_id', null);  // Game has not started yet

    if (gamesToStartError) {
        console.error("Error fetching games to start:", gamesToStartError);
        throw gamesToStartError;
    }

    await Promise.all(gamesToStart.map(game => startGame(game.id)));
}

export async function startGame(gameId: number) {
    try {
        // Fetch registered players for the game, ordered by registration time
        const { data: players, error: playerError } = await supabase
            .from('user_registration')
            .select('user_id, registered_at')
            .eq('game_id', gameId)
            .order('registered_at', { ascending: true });

        if (playerError) throw playerError;

        // Fetch game details including max_rounds
        const { data: gameData, error: gameError } = await supabase
            .from('games')
            .select('max_rounds, round_length_minutes, game_start_date')
            .eq('id', gameId)
            .single();

        if (gameError) throw gameError;

        const registeredPlayersCount = players.length;
        const maxRounds = gameData.max_rounds;
        const roundLengthMinutes = gameData.round_length_minutes;
        const actualRounds = Math.min(Math.ceil(Math.log2(registeredPlayersCount)), maxRounds);
        const gameStartTime = new Date(gameData.game_start_date);
        let roundOneId;

        // Loop through each round and create round entries (with time)
        for (let round = 1; round <= actualRounds; round++) {
            const endTime = new Date(gameStartTime.getTime() + round * roundLengthMinutes * 60000);

            // Insert the round entry into the 'rounds' table
            const { data: insertedRound, error: roundError } = await supabase
                .from('rounds')
                .insert({
                    game_id: gameId,
                    round_number: round,
                    end_time: endTime.toISOString()
                })
                .select('id')
                .single();

            if (roundError) throw roundError;

            if (round === 1) {
                roundOneId = insertedRound.id;
            }
        }

        if (roundOneId === undefined) throw new Error("roundOneId not found");

        // create matches for the first round
        const firstRoundMatches: {
            round_id: number;
            player1_id: number;
            player2_id: number | null;
        }[] = [];

        const firstRoundMatchCount = 2 ** (actualRounds - 1);

        // Create matches and add only the first player
        for (let i = 0; i < firstRoundMatchCount; i++) {
            firstRoundMatches.push({
                round_id: roundOneId,
                player1_id: players[i].user_id,
                player2_id: null
            });
        }

        // Add the second player to the matches if there are enough players
        for (let i = 0; i < firstRoundMatchCount; i++) {
            if (i + firstRoundMatchCount < players.length) {
                firstRoundMatches[i].player2_id = players[i + firstRoundMatchCount].user_id;
            }
        }

        // Insert matches for the first round into the database
        const { error: matchError } = await supabase
            .from('matches')
            .insert(firstRoundMatches);

        if (matchError) {
            console.error('Error inserting matches:', matchError);
            throw matchError;
        }

        // Update the game to set current_round to 1
        const { error: updateGameError } = await supabase
            .from('games')
            .update({ current_round_id: roundOneId })
            .eq('id', gameId);

        if (updateGameError) throw updateGameError;

        await sendPlayDirectCasts(gameId, 1, roundLengthMinutes, players.map(p => p.user_id));

        return null;  // Success
    } catch (error) {
        return error;
    }
}

export async function processActiveGames() {
    const activeGames = await getActiveGames();

    for (const game of activeGames) {
        if (!game.current_round_id) {
            throw new Error(`Game ${game.id} has no current round`);
        }

        // Fetch the current round details, including the end time
        const { data: roundData, error: roundError } = await supabase
            .from('rounds')
            .select('end_time')
            .eq('id', game.current_round_id)
            .single();

        if (roundError) throw roundError;

        // if past the rounds end time, process the round
        const currentTime = new Date().toISOString();
        if (currentTime > roundData.end_time) await processRound(game.current_round_id);
    }
}

export async function processRound(roundId: number) {
    try {
        // Fetch round data with its matches in a single query
        const { data: roundData, error: queryError } = await supabase
            .from('rounds')
            .select(`
                id,
                game_id,
                round_number,
                end_time,
                matches (
                    id,
                    player1_id,
                    player2_id,
                    player1_move,
                    player2_move
                )
            `)
            .eq('id', roundId)
            .single();

        if (queryError || !roundData) {
            throw new Error(`No round data found for round ${roundId}`);
        }

        const matches = roundData.matches.sort((a, b) => a.id - b.id);

        const winners = [];
        for (const match of matches) {
            const winnerId = await getMatchWinner(match.id, match.player1_id, match.player1_move, match.player2_id, match.player2_move);
            await updateWinner(match.id, winnerId);
            winners.push(winnerId);
        }

        // create next set of matches if necessary
        if (winners.length > 1) {
            // Get the roundId for the next round
            const nextRoundNumber = roundData.round_number + 1;
            const { data: nextRoundData, error: nextRoundError } = await supabase
                .from('rounds')
                .select('id, end_time')
                .eq('game_id', roundData.game_id)
                .eq('round_number', nextRoundNumber)
                .single();

            if (nextRoundError) throw nextRoundError;

            if (!nextRoundData) {
                throw new Error(`No round data found for game ${roundData.game_id}, round ${nextRoundNumber}`);
            }

            await createRoundMatches(nextRoundData.id, winners);

            // Update game to the next round
            const { error: gameUpdateError } = await supabase
                .from('games')
                .update({ current_round_id: nextRoundData.id })
                .eq('id', roundData.game_id);

            if (gameUpdateError) throw gameUpdateError;

            const minutesLeft = Math.floor((new Date(nextRoundData.end_time).getTime() - new Date().getTime()) / 60000);

            await sendPlayDirectCasts(roundData.game_id, roundData.round_number + 1, minutesLeft, winners);
        } else {
            // Mark the game as completed and set the winner in the database
            const { error: updateGameError } = await supabase
                .from('games')
                .update({
                    completed: true,
                    winner_id: winners[0]  // Assuming winners[0] contains the ID of the final winner
                })
                .eq('id', roundData.game_id);

            if (updateGameError) {
                throw updateGameError;
            }
        }

        return null;  // Success
    } catch (error) {
        return error;
    }
}

export async function getActiveGames() {
    const { data: activeGames, error: activeGamesError } = await supabase
        .from('games')
        .select('*')
        .not('current_round_id', 'is', null)  // Game is in progress
        .eq('completed', false);  // Only include games that are not completed

    if (activeGamesError) throw activeGamesError;

    return activeGames;
}

export async function getMatchWinner(
    id: number,
    player1_id: number | null,
    player1_move: number | null,
    player2_id: number | null,
    player2_move: number | null,
) {
    let winnerId;

    if (player2_move === null || player2_id === null) {
        winnerId = player1_id;
    } else if (player1_move === null || player1_id === null) {
        winnerId = player2_id;
    } else {
        if (player1_move === player2_move) {
            winnerId = player1_id;  // Player 1 wins ties
        } else if ((player1_move === 0 && player2_move === 2) ||  // Rock beats Scissors
            (player1_move === 1 && player2_move === 0) ||  // Paper beats Rock
            (player1_move === 2 && player2_move === 1)) {  // Scissors beats Paper
            winnerId = player1_id;
        } else {
            winnerId = player2_id;
        }
    }

    if (!winnerId) {
        throw new Error(`Invalid match ${id}`);
    }

    return winnerId;
}

export async function createRoundMatches(roundId: number, playerIds: number[]) {
    try {
        const matches = [];
        // Create matches for the next round
        for (let i = 0; i < playerIds.length; i += 2) {
            const player1 = playerIds[i];
            const player2 = playerIds[i + 1];

            matches.push({
                round_id: roundId,
                player1_id: player1,
                player2_id: player2,
            });
        }

        // Insert the new matches for the next round into the database
        const { error: matchInsertError } = await supabase
            .from('matches')
            .insert(matches);

        if (matchInsertError) throw matchInsertError;

        return null;  // Success
    } catch (error) {
        console.error('Error creating next round matches:', error);
        throw error;
    }
}

async function updateWinner(matchId: number, winnerId: number) {
    const { error } = await supabase
        .from('matches')
        .update({ winner_id: winnerId })
        .eq('id', matchId);

    if (error) throw error;
}

export async function getGameStatus(gameId: string, userId: string): Promise<GameData> {
    const { data: game, error: gameError } = await supabase
        .from('games')
        .select(`
            *,
            rounds:rounds!rounds_game_id_fkey(
                id,
                round_number,
                end_time
            ),
            user_registrations:user_registration!user_registration_game_id_fkey(
                user_id,
                registered_at
            )
        `)
        .eq('id', gameId)
        .single();

    if (gameError) {
        console.error('Error fetching game:', gameError);
        throw new Error(`Failed to fetch game: ${gameError.message || 'Unknown error'}`);
    }

    if (!game) {
        throw new Error(`No game data returned for id ${gameId}`);
    }



    // get all the matches for this game that this user is in
    const { data: userMatches, error: matchError } = await supabase
        .from('matches')
        .select(`
            *,
            rounds!inner(
                game_id,
                round_number
            ),
            player1:users!matches_player1_id_fkey(
                id,
                name,
                display_name,
                image
            ),
            player2:users!matches_player2_id_fkey(
                id,
                name,
                display_name,
                image
            )
        `)
        .eq('rounds.game_id', gameId)
        .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
        .order('id', { ascending: true });

    if (matchError) {
        console.error('Error fetching matches:', matchError);
        throw new Error(`Failed to fetch matches: ${matchError.message || 'Unknown error'}`);
    }

    const currentTime = new Date().toISOString();

    const getGameState = (game: any, currentTime: string) => {
        const roundNumber = getRoundNumber(game);
        if (roundNumber === null) {
            if (currentTime < game.registration_start_date) {
                return 0; // Registration hasn't started
            } else {
                return 1; // Registration is open
            }
        } else if (game.completed) {
            return 3; // Game has ended
        } else {
            return 2; // Game is active
        }
    };

    const getRoundNumber = (game: any) => {
        if (!game.current_round_id) return null;
        return game.rounds.find((round: any) => round.id === game.current_round_id)?.round_number;
    };

    // Fetch user details
    let userName, userDisplayName, userImage;
    const { data: userData, error: userError } = await supabase
        .from('users')
        .select('name, display_name, image')
        .eq('id', userId)
        .single();

    if (userError) {
        console.log(`Adding FID ${userId} to DB`);
        const addedUserData = await addUserToDb(Number(userId));
        userName = addedUserData.name;
        userDisplayName = addedUserData.display_name;
        userImage = addedUserData.image;
        // throw new Error(`Failed to fetch user: ${userError.message || 'Unknown error'}`);
    } else {
        userName = userData.name;
        userDisplayName = userData.display_name;
        userImage = userData.image;
    }

    const combinedGameData: GameData = {
        gameId: game.id,
        userName: userName,
        userDisplayName: userDisplayName,
        userImage: userImage,
        currentRoundId: game.current_round_id,
        currentRoundNumber: getRoundNumber(game),
        gameState: getGameState(game, currentTime),
        registrationStart: game.registration_start_date,
        gameStart: game.game_start_date,
        maxRegistrations: 2 ** game.max_rounds,
        currentRegistrations: game.user_registrations.length,
        userRegistered: game.user_registrations.some(reg => reg.user_id === Number(userId)),
        rounds: game.rounds
            .sort((a, b) => a.id - b.id)  // Sort rounds by id, smallest first
            .map(round => {
                const match = userMatches.find(m => m.round_id === round.id);
                return {
                    id: round.id,
                    round_number: round.round_number,
                    end_time: round.end_time,
                    match: match ? {
                        id: match.id,
                        opponentId: match.player1_id === Number(userId) ? match.player2_id : match.player1_id,
                        opponentMove: match.round_id === game.current_round_id
                            ? null
                            : (match.player1_id === Number(userId) ? match.player2_move : match.player1_move),
                        playerMove: match.player1_id === Number(userId) ? match.player1_move : match.player2_move,
                        playerWon: match.winner_id === Number(userId),
                        opponentName: match.player1_id === Number(userId) ? match.player2?.name ?? null : match.player1?.name ?? null,
                        opponentDisplayName: match.player1_id === Number(userId) ? match.player2?.display_name ?? null : match.player1?.display_name ?? null,
                        opponentImage: match.player1_id === Number(userId) ? match.player2?.image ?? null : match.player1?.image ?? null
                    } : null
                };
            }),
        winnerId: game.winner_id,
    };

    return combinedGameData;
}

export async function addUserToDb(fid: number) {
    const userDetails = await fetchUserDetails(fid);

    const { data: newUser, error: createUserError } = await supabase
        .from('users')
        .insert({
            id: fid,
            display_name: userDetails.Socials.Social[0].profileDisplayName,
            name: userDetails.Socials.Social[0].profileName,
            image: userDetails.Socials.Social[0].profileImage,
            created_at: new Date().toISOString()
        })
        .select()
        .single();
    if (createUserError) {
        throw new Error('Error creating user');
    }
    return newUser;
}

export async function fetchUserDetails(fid: number) {
    const query = `query MyQuery {
        Socials(
            input: {
            filter: { dappName: { _eq: farcaster }, identity: { _eq: "fc_fid:${fid}" } }
            blockchain: ethereum
            }
        ) {
            Social {
            profileDisplayName
            profileImage
            profileName
            }
        }
    }`;

    const { data, error } = await fetchQuery(query);

    if (error) {
        console.error('Error fetching user details:', error);
        throw error;
    }

    return data;
}

export async function getAllUserIds() {
    const { data: users, error } = await supabase
        .from('users')
        .select('id');

    if (error) {
        console.error("Error fetching user IDs:", error);
        return [];
    }

    return users.map(user => user.id);
}

export async function startRegistration(gameId: number, gameStartTime: string) {
    console.log(`Starting registration for game ${gameId}`);

    const { error: updateError } = await supabase
        .from('games')
        .update({ state: 'registering' })
        .eq('id', gameId);

    if (updateError) {
        console.error("Error updating games to registering state:", updateError);
        throw updateError;
    }

    const fids = await getAllUserIds();

    await sendRegistrationDirectCasts(gameId, gameStartTime, fids);
}

export async function sendRegistrationDirectCasts(gameId: number, gameStartTime: string, fids: number[]) {
    const results = await Promise.allSettled(
        fids.map(fid => sendRegistrationDirectCast(gameId, gameStartTime, fid))
    );

    // Log failures but don't stop execution
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failures.length > 0) {
        console.error(`Failed to send ${failures.length} direct casts:`,
            failures.map(f => f.reason));
    }
}

export async function sendRegistrationDirectCast(gameId: number, gameStartTime: string, recipientFid: number) {
    const idempotencyKey = `game_${gameId}`
    const minutesLeft = Math.floor((new Date(gameStartTime).getTime() - new Date().getTime()) / 60000);
    const message = `Tournament #${gameId} is starting in ${formatTimeRemaining(minutesLeft)}. Register in the frame below!`;
    const frameUrl = `https://rps-frame.vercel.app/api/game/${gameId}`;
    await sendDirectCast(recipientFid, idempotencyKey, message);
    await sendDirectCast(recipientFid, idempotencyKey, frameUrl);
}

export async function sendPlayDirectCasts(gameId: number, roundNumber: number, minutesLeft: number, fids: number[]) {
    const results = await Promise.allSettled(
        fids.map(fid => sendPlayDirectCast(gameId, roundNumber, fid, minutesLeft))
    );

    // Log failures but don't stop execution
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failures.length > 0) {
        console.error(`Failed to send ${failures.length} direct casts:`,
            failures.map(f => f.reason));
    }
}

export async function sendPlayDirectCast(gameId: number, roundNumber: number, recipientFid: number, minutesLeft: number) {
    const idempotencyKey = `game_${gameId}_round_${roundNumber}`
    // const idempotencyKey = Math.random().toString(36).substring(2, 15);
    // const idempotencyKey = "ed3d9b95-5eed-475f-9c7d-58bdc3b9ac00";
    const message = `Round ${roundNumber} has begun! You have ${minutesLeft} minutes to select Rock, Pepe, or Slizards!`;
    const frameUrl = `https://rps-frame.vercel.app/api/game/${gameId}`;
    await sendDirectCast(recipientFid, idempotencyKey, message);
    await sendDirectCast(recipientFid, idempotencyKey, frameUrl);
}

export async function sendDirectCast(recipientFid: number, idempotencyKey: string, message: string) {
    const apiKey = process.env.DIRECT_CAST_API_KEY;

    try {
        const response = await axios.put('https://api.warpcast.com/v2/ext-send-direct-cast',
            {
                recipientFid,
                message,
                idempotencyKey
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log(`DC sent to ${recipientFid}:: ${message}`);
        return response.data;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            throw new Error(`Failed to send direct cast: ${error.response?.data || error.message}`);
        }
        throw error;
    }
}

function formatTimeRemaining(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (hours === 0) {
        return `${remainingMinutes} ${remainingMinutes === 1 ? 'minute' : 'minutes'}`;
    } else if (hours === 1) {
        return remainingMinutes === 0 
            ? `one hour` 
            : `one hour ${remainingMinutes} ${remainingMinutes === 1 ? 'minute' : 'minutes'}`;
    } else {
        return remainingMinutes === 0
            ? `${hours} hours`
            : `${hours} hours ${remainingMinutes} ${remainingMinutes === 1 ? 'minute' : 'minutes'}`;
    }
}
