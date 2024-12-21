import { Request, Response } from 'express';
import { supabase } from '../db/supabase';
import { addUserToDb, _processGames } from '../services/gameService';
import { fetchTokenBalance } from '../services/airstackService';
import { Database } from '../db/database.types';
import { checkMention } from '../services/registrationService';

export const mention = async (req: Request, res: Response) => {
    console.log('mentioned: ', JSON.stringify(req.body));

    await checkMention(req.body.data.hash, req.body.data.author.fid, req.body.data.text);
    res.status(200).send({ message: 'success' });
}

export const testMention = async (req: Request, res: Response) => {
    const { cast_hash, author_fid, cast_text } = req.body;

    await checkMention(cast_hash, author_fid, cast_text);
    res.status(200).send({ message: 'success' });
}

export const createGame = async (req: Request, res: Response) => {
    const { minutesToStart, maxRounds, sponsorId, roundLengthMinutes, winnerReward, depositId } = req.body;

    if (!minutesToStart || !maxRounds || !sponsorId || !roundLengthMinutes || !winnerReward || !depositId) {
        return res.status(400).json({
            message: 'Missing required fields',
            required: ['minutes_to_start', 'max_rounds', 'sponsor_id', 'round_length_minutes', 'winner_reward', 'deposit_id']
        });
    }

    // Check if deposit ID has been used
    const { data: existingGame, error: depositCheckError } = await supabase
        .from('games')
        .select('id')
        .eq('deposit_id', depositId)
        .single();

    if (existingGame) {
        return res.status(400).json({
            message: 'Deposit ID has already been used for another game'
        });
    }

    // round start time is rounded to the nearest 15 minutes
    const registrationStartDate = new Date(Date.now()).toISOString();
    const baseTime = new Date(Date.now() + minutesToStart * 60 * 1000);
    const roundedMinutes = Math.ceil(baseTime.getMinutes() / 15) * 15;
    const gameStartDate = new Date(
        baseTime.setMinutes(roundedMinutes, 0, 0)
    ).toISOString();

    if (process.env.SKIP_CREATE === 'true') {
        console.log(`Skipping game creation with deposit ID ${depositId}, sponsor ID: ${sponsorId}, winner reward: ${winnerReward}`);

        res.status(201).send({ message: 'Skipped game creation', gameId: 1 });
        return;
    }

    const { data, error } = await supabase
        .from('games')
        .insert([{
            registration_start_date: registrationStartDate,
            game_start_date: gameStartDate,
            current_round_id: null,
            completed: false,
            max_rounds: maxRounds,
            sponsor_id: sponsorId,
            deposit_id: depositId,
            round_length_minutes: roundLengthMinutes,
            winner_reward: winnerReward,
            state: 'created' as Database["public"]["Enums"]["game_state"]
        }])
        .select();

    if (error) {
        console.error('Error details:', error);
        return res.status(500).json({ message: 'Error creating game', error });
    }

    res.status(201).send({ message: 'Game created', gameId: data[0].id });
};

export const registerForGame = async (req: Request, res: Response) => {
    const { fid, gameId } = req.body;

    try {
        // Fetch game details including max_rounds
        const { data: gameData, error: gameError } = await supabase
            .from('games')
            .select('max_rounds, current_round_id')
            .eq('id', gameId)
            .single();

        if (gameError) {
            return res.status(404).json({ message: 'Game not found' });
        }

        if (gameData.current_round_id !== null) {
            return res.status(400).json({ message: 'Game has already started' });
        }

        const maxRounds = gameData.max_rounds;

        // check if user exists in db
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('id', fid)
            .single();

        // add user to db if they don't exist
        if (!userData) await addUserToDb(fid);


        // Check if user is already registered for this game
        const { data: existingRegistration, error: checkError } = await supabase
            .from('user_registration')
            .select()
            .eq('game_id', gameId)
            .eq('user_id', fid)
            .single();

        if (checkError && checkError.code !== 'PGRST116') {
            return res.status(500).send('Error checking existing registration');
        }

        if (existingRegistration) {
            return res.status(400).send('User already registered for this game');
        }

        const ftBalance = await fetchTokenBalance(fid);

        // Insert user registration
        const { error: registrationError } = await supabase
            .from('user_registration')
            .insert([{
                game_id: gameId,
                user_id: fid,
                registered_at: new Date().toISOString(),
                token_balance: ftBalance,
                force: false
            }])
            .select();

        if (registrationError) {
            return res.status(500).send('Error registering for game');
        }

        res.status(201).send({ message: 'Registered for game' });
    } catch (err) {
        console.error('Caught error:', err);
        res.status(500).json({ message: 'An error occurred while registering for the game', error: (err as Error).message });
    }
};

export const makePlay = async (req: Request, res: Response) => {
    const { matchId, fid, move } = req.body;

    if (![0, 1, 2].includes(move)) {
        return res.status(400).json({ message: 'Invalid move' });
    }

    try {
        // Fetch match data
        const { data: matchData, error: matchError } = await supabase
            .from('matches')
            .select(`
                id, player1_id, player2_id, player1_move, player2_move, round_id,
                rounds!inner(game_id)
            `)
            .eq('id', matchId)
            .single();

        if (matchError || !matchData) {
            return res.status(404).send('Match not found');
        }

        // Fetch game data to check current round
        const { data: gameData, error: gameError } = await supabase
            .from('games')
            .select('current_round_id')
            .eq('id', matchData.rounds.game_id)
            .single();

        if (gameError || !gameData) {
            return res.status(404).send('Game not found');
        }

        // Check if the match belongs to the current round
        if (matchData.round_id !== gameData.current_round_id) {
            return res.status(400).send('This match is not in the current round');
        }

        let updateField;
        if (matchData.player1_id === fid && !matchData.player1_move) {
            updateField = 'player1_move';
        } else if (matchData.player2_id === fid && !matchData.player2_move) {
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

        // Update user's last_played timestamp
        const { error: userUpdateError } = await supabase
            .from('users')
            .update({ last_played: new Date().toISOString() })
            .eq('id', fid);

        if (userUpdateError) {
            console.error('Error updating last_played:', userUpdateError);
            // Don't return error since the move was successful
        }

        res.status(200).send({ message: 'Move recorded' });
    } catch (err) {
        res.status(500).json({ message: 'An error occurred while making a play', error: (err as Error).message });
    }
};

export const processGames = async (req: Request, res: Response) => {
    try {
        await _processGames();

        res.status(200).send({ message: 'Processing completed' });
    } catch (error) {
        console.error('Error processing games:', error);
        res.status(500).send({ message: 'Error processing games', error });
    }
};

export const test = async (req: Request, res: Response) => {
    // await generateBracket("10", "5");
    // await publishNewRoundCast(10, 5);
    console.log('test endpoint hit');
    // await testReplyCast();
    // await sendNewGameDirectCast(347930, "https://warpcast.com/rps-referee/123");

    const testText = 'asdfhttps://rps-frame.vercel.pp/api/game/15asdf';
    const gameId = await checkMention('asd', 1, testText);

    res.status(200).send({ message: 'Test successful' });
}

