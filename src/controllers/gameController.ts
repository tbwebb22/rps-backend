import { Request, Response } from 'express';
import { supabase } from '../db/supabase';
import { startReadyGames, processActiveGames, startGame, processRound, getActiveGames, getMatchWinner, advanceRound, updateWinner } from '../services/gameService';

export const createGame = async (req: Request, res: Response) => {
    const { registration_start_date, game_start_date, max_rounds, sponsor_id } = req.body;

    try {
        const { data, error } = await supabase
            .from('games')
            .insert([{ 
                registration_start_date, 
                game_start_date, 
                current_round: 0,
                completed: false,
                max_rounds,
                sponsor_id
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
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('id', fid)
            .single();

        if (userError && userError.code !== 'PGRST116') {
            return res.status(500).send('Error checking user');
        }

        let userId = userData?.id;
        
        if (!userId) {
            const { data: newUser, error: createUserError } = await supabase
                .from('users')
                .insert({ 
                    fid,
                    created_at: new Date().toISOString()
                })
                .select()
                .single();

            if (createUserError) {
                return res.status(500).send('Error creating user');
            }
            userId = newUser.id;
        }

        const { error: registrationError } = await supabase
            .from('user_registration')
            .insert([{ 
                game_id: gameId, 
                user_id: userId,
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
    const { matchId, fid, move } = req.body;

    if (![0, 1, 2].includes(move)) {
        return res.status(400).json({ message: 'Invalid move' });
    }

    try {
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('fid', fid)
            .single();

        if (userError) {
            return res.status(404).send('User not found');
        }

        const userId = userData.id;

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
