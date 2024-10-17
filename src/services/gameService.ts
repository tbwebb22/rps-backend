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
        if (currentTime > roundData.end_time) {
            await processRound(game.id, game.current_round);
        } else {
            console.log(`Round ${game.current_round} for game ${game.id} has not ended yet.`);
        }
    }
}

export async function startGame(gameId: number) {
    console.log("starting game ", gameId);
    try {
        // Fetch registered players for the game
        const { data: players, error: playerError } = await supabase
            .from('user_registration')
            .select('user_id')
            .eq('game_id', gameId);

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
        const actualRounds = Math.min(Math.floor(Math.log2(registeredPlayersCount)), maxRounds);
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
        const matches = [];

        // Create matches for the first round by pairing up players
        for (let i = 0; i < players.length; i += 2) {
            // TODO: this probably needs to be handled differently 
            // for example: 5 players still requires 3 rounds
            // only the first round should potentially have player2 be null
            const player1 = players[i].user_id;
            const player2 = (i + 1 < players.length) ? players[i + 1].user_id : null;  // Handle odd player

            matches.push({
                round_id: 1,  // First round
                game_id: gameId,
                player1_id: player1,
                player2_id: player2
            });
        }

        console.log('Matches to insert:', matches);

        // Insert matches for the first round into the database
        const { error: matchError } = await supabase
            .from('matches')
            .insert(matches);

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
    // Implementation
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

export async function getMatchWinner(match: any) {
    // Implementation
}

export async function advanceRound(gameId: number, nextRound: number, players: any[]) {
    // Implementation
}

export async function updateWinner(matchId: number, winnerId: number) {
    // Implementation
}

// Implement other helper functions like getRandomMove, updatePlayerMove, determineWinner, etc.
