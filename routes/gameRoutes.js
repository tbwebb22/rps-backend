const express = require('express');
const router = express.Router();
const supabase = require('../supabase');

// Admin: Create a new game
// TODO: remove start_times, they are redundant
router.post('/create', async (req, res) => {
    const { registration_start_date, registration_end_date } = req.body;

    const current_round = 0;

    try {
        const { data, error } = await supabase
            .from('games')
            .insert([{ 
                registration_start_date, 
                registration_end_date, 
                current_round 
            }])
            .select();

        if (error) {
            console.error('Error details:', error);
            return res.status(500).json({ message: 'Error creating game', error });
        }
    
        res.status(201).send({ message: 'Game created', gameId: data[0].id });
    } catch (err) {
        console.error('Caught error:', err);
        res.status(500).json({ message: 'An error occurred while creating the game', error: err.message });
    }
});

// Register user for a game
router.post('/register', async (req, res) => {
    const { fid, gameId } = req.body;

    // Check if user exists, create if not
    const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('fid', fid)
        .single();

    if (userError && userError.code !== 'PGRST116') {
        return res.status(500).send('Error checking user');
    }

    let userId = userData?.id;
    
    if (!userId) {
        const { data: newUser, error: createUserError } = await supabase
            .from('users')
            .insert([{ fid }])
            .select()
            .single();

        if (createUserError) {
            return res.status(500).send('Error creating user');
        }
        userId = newUser.id;
    }

    // Register the player in the game
    const { error: registrationError } = await supabase
        .from('user_registration')
        .insert([{ game_id: gameId, user_id: userId }])
        .select();

    if (registrationError) {
        return res.status(500).send('Error registering for game');
    }

    res.status(201).send({ message: 'Registered for game' });
});

// User makes a play
router.post('/play', async (req, res) => {
    const { matchId, fid, move } = req.body;

    // Validate that the move is either 0, 1, or 2
    if (![0, 1, 2].includes(move)) {
        return res.status(400).json({ message: 'Invalid move' });
    }

    // Get the user ID based on FID
    const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('fid', fid)
        .single();

    if (userError) {
        return res.status(404).send('User not found');
    }

    const userId = userData.id;

    // Get match details and update the play
    const { data: matchData, error: matchError } = await supabase
        .from('matches')
        .select('player1_id, player2_id, player1_move, player2_move')
        .eq('id', matchId)
        .single();

    if (matchError || !matchData) {
        return res.status(404).send('Match not found');
    }

    let updateField;

    if (matchData.player1_id === userId && !matchData.player1_move) {
        updateField = 'player1_move';
    } else if (matchData.player2_id === userId && !matchData.player2_move) {
        updateField = 'player2_move';
    } else {
        return res.status(400).send('Invalid move or move already made');
    }

    const { error: updateError } = await supabase
        .from('matches')
        .update({ [updateField]: move })
        .eq('id', matchId);

    if (updateError) {
        return res.status(500).send('Error making move');
    }

    res.status(200).send({ message: 'Move recorded' });
});

router.post('/process', async (req, res) => {
    try {
        // Step 1: Start new games where registration has ended and the game has not started yet
        await startReadyGames();

        // Step 2: Process ongoing games but only if the current round's end_time has elapsed
        await processActiveGames();

       console.log("Processing completed successfully.");
       res.status(200).send({ message: 'Processing completed' })

    } catch (error) {
        console.error('Error processing games:', error);
        res.status(500).send({ message: 'Error processing games', error });
    }
});

async function startReadyGames() {
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

async function startGame(gameId) {
    console.log("starting game ", gameId);
    try {
        // Fetch registered players for the game
        const { data: players, error: playerError } = await supabase
            .from('user_registration')
            .select('user_id')
            .eq('game_id', gameId);

        if (playerError) throw playerError;

        const totalPlayers = players.length;
        const totalRounds = Math.ceil(Math.log2(totalPlayers));
        console.log(`game ${gameId} totalPlayers: ${totalPlayers}, totalRounds: ${totalRounds}`)

        const currentDate = new Date();
        let startTime = new Date(currentDate);
        let endTime = new Date(currentDate);

        // Loop through each round and create round entries (with time)
        for (let round = 1; round <= totalRounds; round++) {
            startTime.setDate(currentDate.getDate() + (round - 1));
            endTime.setDate(currentDate.getDate() + round);  // Each round lasts 1 day

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

async function processActiveGames() {
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

async function getActiveGames() {
    const { data: activeGames, error: activeGamesError } = await supabase
    .from('games')
    .select('*')
    .gt('current_round', 0)  // Game is in progress
    .eq('completed', false);  // Only include games that are not completed

    if (activeGamesError) throw activeGamesError;

    return activeGames;
}

async function processRound(gameId, currentRound) {
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

async function getMatchWinner(match) {
    let winnerId;

    // Check if players have made their moves, and assign a random move if not
    let player1Move = match.player1_move;
    let player2Move = match.player2_move;

    if (player1Move === null) {
        console.log("Assigning random move to player 1");
        player1Move = getRandomMove();  // Assign random move to player1
        await updatePlayerMove(match.id, 'player1_move', player1Move);
    }

    if (player2Move === null && match.player2_id) {
        console.log("Assigning random move to player 2");
        player2Move = getRandomMove();  // Assign random move to player2
        await updatePlayerMove(match.id, 'player2_move', player2Move);
    }
    
    console.log('a');

    if (!match.player2_id) {
        // If player2_id is null, player1 automatically advances
        console.log("Player 2 is null, player 1 automatically advances");
        winnerId = match.player1_id;
    } else {
        // Determine winner based on the moves of player1 and player2
        console.log("determining winner");
        winnerId = determineWinner(match.player1_id, match.player2_id, player1Move, player2Move);
        console.log("Winning player id: ", winnerId);
    }

    return winnerId;
}

async function advanceRound(gameId, nextRound, players) {
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

function getRandomMove() {
    const moves = [0, 1, 2];  // 0: Rock, 1: Paper, 2: Scissors
    const randomIndex = Math.floor(Math.random() * moves.length);
    return moves[randomIndex];
}

async function updatePlayerMove(matchId, playerMoveField, move) {
    const { error } = await supabase
        .from('matches')
        .update({ [playerMoveField]: move })
        .eq('id', matchId);

    if (error) throw error;
}

function determineWinner(player1Id, player2Id, player1Move, player2Move) {
    if (player1Move === player2Move) return player1Id;  // TODO: handle tiebreaker

    if ((player1Move === 0 && player2Move === 2) ||  // Rock beats Scissors
        (player1Move === 1 && player2Move === 0) ||  // Paper beats Rock
        (player1Move === 2 && player2Move === 1)) {  // Scissors beats Paper
        return player1Id;
    } else {
        return player2Id;
    }
}

async function updateWinner(matchId, winnerId) {
    console.log(`updating winner for match ${matchId} with winnerId ${winnerId}`)
    const { error } = await supabase
        .from('matches')
        .update({ winner_id: winnerId })
        .eq('id', matchId);

    if (error) throw error;
}

module.exports = router;
