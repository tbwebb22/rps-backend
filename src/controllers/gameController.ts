import { Request, Response } from 'express';
import { supabase } from '../db/supabase';
import { startReadyGames, processActiveGames, startGame, processRound, getActiveGames, getMatchWinner } from '../services/gameService';

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
                round_length_minutes
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
    console.log('body: ', req.body);
    console.log(`registering for game ${gameId} with fid ${fid}`);
    try {
        // Fetch game details including max_rounds
        const { data: gameData, error: gameError } = await supabase
            .from('games')
            .select('max_rounds, registration_start_date, game_start_date, current_round_id')
            .eq('id', gameId)
            .single();

        if (gameError) {
            return res.status(404).json({ message: 'Game not found' });
        }

        const currentTime = new Date();
        const registrationStartDate = new Date(gameData.registration_start_date);
        const gameStartDate = new Date(gameData.game_start_date);

        // if (currentTime < registrationStartDate) {
        //     return res.status(400).json({ message: 'Registration has not started yet' });
        // }

        // if (currentTime >= gameStartDate) {
        //     return res.status(400).json({ message: 'Registration period has ended' });
        // }

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
        if (!userData) {
            const { data: newUser, error: createUserError } = await supabase
                .from('users')
                .insert({ 
                    id: fid,
                    created_at: new Date().toISOString()
                })
                .select()
                .single();

            if (createUserError) {
                return res.status(500).send('Error creating user');
            }
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

        // Insert user registration
        const { error: registrationError } = await supabase
            .from('user_registration')
            .insert([{ 
                game_id: gameId, 
                user_id: fid,
                registered_at: new Date().toISOString()
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
    console.log("making play");
    const { matchId, fid, move } = req.body;
    console.log("matchId: ", matchId);
    console.log("fid: ", fid);
    console.log("move: ", move);

    if (![0, 1, 2].includes(move)) {
        return res.status(400).json({ message: 'Invalid move' });
    }

    try {
        console.log("matchId: ", matchId);
        // Fetch match data
        const { data: matchData, error: matchError } = await supabase
            .from('matches')
            .select('id, player1_id, player2_id, player1_move, player2_move, round_id')
            .eq('id', matchId)
            .single();

        if (matchError || !matchData) {
            return res.status(404).send('Match not found');
        }

        console.log("matchData: ", matchData);

        // Fetch associated round data
        const { data: roundData, error: roundError } = await supabase
            .from('rounds')
            .select('id, start_time, end_time')
            .eq('id', matchData.round_id)
            .single();

        if (roundError) {
            return res.status(500).send('Error fetching round data');
        }

        console.log("roundData: ", roundData);

        // Check if the current time is within the round's start and end times
        const currentTime = new Date();
        const roundStartTime = new Date(roundData.start_time);
        const roundEndTime = new Date(roundData.end_time);

        console.log("b");
        // if (currentTime < roundStartTime || currentTime > roundEndTime) {
        //     return res.status(400).send('Move not allowed outside of round time');
        // }

        let updateField;
        console.log("a");
        console.log("player1: ", matchData.player1_id);
        console.log("fid: ", fid);
        if (matchData.player1_id === fid && !matchData.player1_move) {
            updateField = 'player1_move';
            console.log("1");
        } else if (matchData.player2_id === fid && !matchData.player2_move) {
            updateField = 'player2_move';
            console.log("2");
        } else {
            return res.status(400).send('Invalid move or move already made');
            console.log("3");
        }

        console.log("MOVE");
        const { error: updateError } = await supabase
            .from('matches')
            .update({ [updateField]: move })
            .eq('id', matchId);

        if (updateError) {
            return res.status(500).send('Error making move');
        }

        res.status(200).send({ message: 'Move recorded' });
    } catch (err) {
        console.error('Caught error:', err);
        res.status(500).json({ message: 'An error occurred while making a play', error: (err as Error).message });
    }
};

export const processGames = async (req: Request, res: Response) => {
    try {
        await startReadyGames();
        await processActiveGames();

        console.log("Processing completed successfully.");
        res.status(200).send({ message: 'Processing completed' });
    } catch (error) {
        console.error('Error processing games:', error);
        res.status(500).send({ message: 'Error processing games', error });
    }
};
