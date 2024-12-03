import { Request, Response } from 'express';
import { supabase } from '../db/supabase';
import { addUserToDb, fetchTokenBalance, _processGames } from '../services/gameService';
import { Database } from '../db/database.types';
import { generateBracket } from '../services/bracketService';
import { publishCast } from '../services/publishCastService';

export const test = async (req: Request, res: Response) => {
    // await generateBracket("10", "5");

    await publishCast("testing... testing...");
    res.status(200).send({ message: 'Test successful' });
}

export const createGame = async (req: Request, res: Response) => {
    const { registration_start_date, game_start_date, max_rounds, sponsor_id, round_length_minutes } = req.body;

    try {
        const { data, error } = await supabase
            .from('games')
            .insert([{
                registration_start_date,
                game_start_date,
                current_round_id: null,
                completed: false,
                max_rounds,
                sponsor_id,
                round_length_minutes,
                state: 'created' as Database["public"]["Enums"]["game_state"]
            }])
            .select();

        if (error) {
            console.error('Error details:', error);
            return res.status(500).json({ message: 'Error creating game', error });
        }

        res.status(201).send({ message: 'Game created', gameId: data[0].id });
    } catch (err) {
        console.error('Caught error:', err);
        res.status(500).json({ message: 'An error occurred while creating the game', error: (err as Error).message });
    }
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

        // Check if the game is already full
        const { count, error: countError } = await supabase
            .from('user_registration')
            .select('*', { count: 'exact' })
            .eq('game_id', gameId);

        if (countError || count === null) {
            return res.status(500).send('Error checking game capacity');
        }

        if (count >= 2 ** maxRounds) {
            return res.status(400).send('Game is already full');
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

