import { supabase } from '../db/supabase';

export async function startReadyGames() {
    const { data: gamesToStart, error: gamesToStartError } = await supabase
        .from('games')
        .select('*')
        .lte('registration_end_date', new Date().toISOString())  // Registration has ended
        .eq('current_round', 0);  // Game has not started yet

    if (gamesToStartError) {
        console.error("Error fetching games to start:", gamesToStartError);
        throw gamesToStartError;
    }

    await Promise.all(gamesToStart.map(game => startGame(game.id)));
}

export async function processActiveGames() {
    const activeGames = await getActiveGames();

    for (const game of activeGames) {
        // Fetch the current round details, including the end time
        const { data: roundData, error: roundError } = await supabase
            .from('rounds')
            .select('end_time')
            .eq('game_id', game.id)
            .eq('round_number', game.current_round)
            .single();

        if (roundError) throw roundError;

        const currentTime = new Date().toISOString();
        if (currentTime > roundData.end_time) await processRound(game.id, game.current_round);
    }
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

        // Extract just the user_ids in the correct order
        // const orderedPlayerIds = players.map(player => player.user_id);

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
        const actualRounds = Math.min(Math.floor(Math.log2(registeredPlayersCount)), maxRounds);
        const actualPlayers = 2 ** actualRounds;
        const gameStartTime = new Date(gameData.game_start_date);

        // Loop through each round and create round entries (with time)
        for (let round = 1; round <= actualRounds; round++) {
            const startTime = new Date(gameStartTime.getTime() + (round - 1) * roundLengthMinutes * 60000);
            const endTime = new Date(gameStartTime.getTime() + round * roundLengthMinutes * 60000);

            // Insert the round entry into the 'rounds' table
            const { error: roundError } = await supabase
                .from('rounds')
                .insert({
                    game_id: gameId,
                    round_number: round,
                    start_time: startTime.toISOString(),
                    end_time: endTime.toISOString()
                });

            if (roundError) throw roundError;
        }

        // create matches for the first round
        const firstRoundMatches = [];

        const firstRoundMatchCount = actualPlayers / 2;

        // Create matches for the first round by pairing up players
        for (let i = 0; i < firstRoundMatchCount; i++) {
            const player1 = players[i * 2].user_id;
            const player2 = players[i * 2 + 1].user_id;

            firstRoundMatches.push({
                round_id: 1,
                game_id: gameId,
                player1_id: player1,
                player2_id: player2
            });
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
            .update({ current_round: 1 })
            .eq('id', gameId);

        if (updateGameError) throw updateGameError;

        return null;  // Success
    } catch (error) {
        return error;
    }
}

export async function processRound(gameId: number, currentRound: number) {
    console.log(`Processing round ${currentRound} for game ${gameId}`);
    try {
        // Fetch matches for the current round
        const { data: matches, error: matchError } = await supabase
            .from('matches')
            .select('*')
            .eq('game_id', gameId)
            .eq('round_id', currentRound);

        if (matchError) throw matchError;

        console.log("found following matches for this round: ", matches);

        const winners = [];
        for (const match of matches) {
            const winnerId = await getMatchWinner(match);
            await updateWinner(match.id, winnerId);
            winners.push(winnerId);
        }

        // create next set of matches if necessary
        if (matches.length > 1) {
            // Create next round with winners
            const nextRound = currentRound + 1;
            console.log("winners: ", winners);
            await advanceRound(gameId, nextRound, winners);

        } else {
            console.log("completing");
            // Mark the game as completed in the database
            const { error: updateGameError } = await supabase
                .from('games')
                .update({ completed: true })
                .eq('id', gameId);

            if (updateGameError) {
                throw updateGameError;
            }

            console.log(`Game ${gameId} completed. Winner: ${winners[0]}`);
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
        .gt('current_round', 0)  // Game is in progress
        .eq('completed', false);  // Only include games that are not completed

    if (activeGamesError) throw activeGamesError;

    return activeGames;
}

export async function getMatchWinner(
    match: {
        id: number;
        player1_id: number;
        player1_move: number | null;
        player2_id: number;
        player2_move: number | null;
        round_id: number;
        winner_id: number | null;
    }) {
    let winnerId;

    if (match.player2_move === null) {
        winnerId = match.player1_id;
    } else if (match.player1_move === null) {
        winnerId = match.player2_id;
    } else {
        winnerId = determineWinner(match.player1_id, match.player2_id, match.player1_move, match.player2_move);
    }

    return winnerId;
}

function determineWinner(player1Id: number, player2Id: number, player1Move: number, player2Move: number) {
    if (player1Move === player2Move) return player1Id;  // Player 1 wins ties

    if ((player1Move === 0 && player2Move === 2) ||  // Rock beats Scissors
        (player1Move === 1 && player2Move === 0) ||  // Paper beats Rock
        (player1Move === 2 && player2Move === 1)) {  // Scissors beats Paper
        return player1Id;
    } else {
        return player2Id;
    }
}

export async function advanceRound(gameId: number, nextRound: number, players: any[]) {
    // Implementation
}

export async function createRoundMatches(roundId: number) {
    try {
        const matches = [];
        // Create matches for the next round
        for (let i = 0; i < players.length; i += 2) {
            const player1 = players[i];
            const player2 = (i + 1 < players.length) ? players[i + 1] : null;  // Handle odd number of winners

            matches.push({
                round_id: nextRound,
                game_id: gameId,
                player1_id: player1,
                player2_id: player2,
            });

            // if (!player2) {
            //     break;  // If there is an odd number of winners, player1 automatically advances
            // }
        }

        // Insert the new matches for the next round into the database
        const { error: matchInsertError } = await supabase
            .from('matches')
            .insert(matches);

        if (matchInsertError) throw matchInsertError;

        // Update game to move to the next round
        const { error: gameUpdateError } = await supabase
            .from('games')
            .update({ current_round: nextRound })
            .eq('id', gameId);

        if (gameUpdateError) throw gameUpdateError;

        console.log(`Game ${gameId} advanced to round ${nextRound}`);
        return null;  // Success
    } catch (error) {
        console.error('Error creating next round matches:', error);
        throw error;
    }
}

export async function updateWinner(matchId: number, winnerId: number) {
    // Implementation
}

// Implement other helper functions like getRandomMove, updatePlayerMove, determineWinner, etc.
