import { supabase } from '../db/supabase';

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
    console.log("starting game ", gameId);
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
        const actualPlayers = Math.min(2 ** actualRounds, registeredPlayersCount);
        const gameStartTime = new Date(gameData.game_start_date);
        let roundOneId;

        // Loop through each round and create round entries (with time)
        for (let round = 1; round <= actualRounds; round++) {
            const startTime = new Date(gameStartTime.getTime() + (round - 1) * roundLengthMinutes * 60000);
            const endTime = new Date(gameStartTime.getTime() + round * roundLengthMinutes * 60000);

            // Insert the round entry into the 'rounds' table
            const { data: insertedRound, error: roundError } = await supabase
                .from('rounds')
                .insert({
                    game_id: gameId,
                    round_number: round,
                    start_time: startTime.toISOString(),
                    end_time: endTime.toISOString()
                })
                .select('id')
                .single();

            if (roundError) throw roundError;

            if (round === 1) {
                roundOneId = insertedRound.id;
                console.log("roundOneId: ", roundOneId);
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
            const player1 = players[i].user_id;

            firstRoundMatches.push({
                round_id: roundOneId,
                player1_id: player1,
                player2_id: null
            });
        }

        // Add the second player to the matches, some matches may have null as player2_id
        for (let i = 0; i < firstRoundMatchCount; i++) {
            if (i + firstRoundMatchCount < players.length) {
                firstRoundMatches[i].player2_id = players[i + firstRoundMatchCount].user_id;
            } else {
                firstRoundMatches[i].player2_id = null;
            }
        }

        console.log('First round matches:', firstRoundMatches);

        // Insert matches for the first round into the database
        const { error: matchError } = await supabase
            .from('matches')
            .insert(firstRoundMatches);

        if (matchError) {
            console.error('Error inserting matches:', matchError);
            throw matchError;
        }

        console.log('Matches successfully inserted.');

        // Update the game to set current_round to 1
        const { error: updateGameError } = await supabase
            .from('games')
            .update({ current_round_id: roundOneId })
            .eq('id', gameId);

        if (updateGameError) throw updateGameError;

        return null;  // Success
    } catch (error) {
        return error;
    }
}

export async function processActiveGames() {
    const activeGames = await getActiveGames();

    console.log("activeGames: ", activeGames);

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

        console.log("roundData: ", roundData);

        const currentTime = new Date().toISOString();
        console.log("currentTime: ", currentTime);
        console.log("roundData.end_time: ", roundData.end_time);
        if (currentTime > roundData.end_time) await processRound(game.current_round_id);
    }
}

export async function processRound(roundId: number) {
    try {
        console.log("processing round: ", roundId);
        // Fetch round data
        const { data: roundData, error: roundError } = await supabase
            .from('rounds')
            .select('*')
            .eq('id', roundId)
            .single();

        if (roundError || !roundData) {
            throw new Error(`No round data found for round ${roundId}`);
        }

        // Fetch associated game data
        const { data: gameData, error: gameError } = await supabase
            .from('games')
            .select('*')
            .eq('id', roundData.game_id)
            .single();

        if (gameError) {
            throw new Error(`Error fetching game data for round ${roundId}`);
        }

        console.log("roundData: ", roundData);
        console.log("gameData: ", gameData);

        // Fetch matches for the current round
        const { data: matches, error: matchError } = await supabase
            .from('matches')
            .select('*')
            .eq('round_id', roundId);

        if (matchError) throw matchError;

        console.log("found following matches for this round: ", matches);

        const winners = [];
        for (const match of matches) {
            const winnerId = await getMatchWinner(match);
            await updateWinner(match.id, winnerId);
            winners.push(winnerId);
        }

        // create next set of matches if necessary
        if (winners.length > 1) {
            // Get the roundId for the next round
            const nextRoundNumber = roundData.round_number + 1;
            const { data: nextRoundData, error: nextRoundError } = await supabase
                .from('rounds')
                .select('id')
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
        } else {
            console.log(`completing game ${roundData.game_id}`);
            // Mark the game as completed in the database
            const { error: updateGameError } = await supabase
                .from('games')
                .update({ completed: true })
                .eq('id', roundData.game_id);

            if (updateGameError) {
                throw updateGameError;
            }

            console.log(`Game ${roundData.game_id} completed. Winner: ${winners[0]}`);
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
    match: {
        id: number;
        player1_id: number | null;
        player1_move: number | null;
        player2_id: number | null;
        player2_move: number | null;
        round_id: number;
        winner_id: number | null;
    }) {
        let winnerId;

    if (match.player2_move === null || match.player2_id === null) {
        winnerId = match.player1_id;
    } else if (match.player1_move === null || match.player1_id === null) {
        winnerId = match.player2_id;
    } else {
        if (match.player1_move === match.player2_move) {
            winnerId = match.player1_id;  // Player 1 wins ties
        } else if ((match.player1_move === 0 && match.player2_move === 2) ||  // Rock beats Scissors
        (match.player1_move === 1 && match.player2_move === 0) ||  // Paper beats Rock
        (match.player1_move === 2 && match.player2_move === 1)) {  // Scissors beats Paper
            winnerId =  match.player1_id;
        } else {
            winnerId = match.player2_id;
        }
    }

    if (!winnerId) {
        throw new Error(`Invalid match ${match.id}`);
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
    console.log(`updating winner for match ${matchId} with winnerId ${winnerId}`)
    const { error } = await supabase
        .from('matches')
        .update({ winner_id: winnerId })
        .eq('id', matchId);

    if (error) throw error;
}

export async function getGameStatus(gameId: string, userId: string) {
    console.log(`getting game status for game ${gameId} and user ${userId}`);

    const { data: game, error: gameError } = await supabase
        .from('games')
        .select(`
            *,
            rounds:rounds!rounds_game_id_fkey(
                id,
                round_number,
                start_time,
                end_time
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
        )
    `)
    .eq('rounds.game_id', gameId)
    .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
    .order('id', { ascending: true });

    if (matchError) {
        console.error('Error fetching matches:', matchError);
        throw new Error(`Failed to fetch matches: ${matchError.message || 'Unknown error'}`);
    }

    const combinedGameData = {
        gameId: game.id,
        currentRoundId: game.current_round_id,
        completed: game.completed,
        rounds: game.rounds.map(round => {
            const match = userMatches.find(m => m.round_id === round.id);
            return {
                id: round.id,
                round_number: round.round_number,
                start_time: round.start_time,
                end_time: round.end_time,
                match: match ? {
                    id: match.id,
                    opponentId: match.player1_id === Number(userId) ? match.player2_id : match.player1_id,
                    opponentMove: match.round_id === game.current_round_id 
                        ? null 
                        : (match.player1_id === Number(userId) ? match.player2_move : match.player1_move),
                    playerMove: match.player1_id === Number(userId) ? match.player1_move : match.player2_move,
                    playerWon: match.winner_id === Number(userId),
                } : null
            };
        })
    };

    // console.log('Combined game data:', JSON.stringify(combinedGameData, null, 2));

    return combinedGameData;
}
