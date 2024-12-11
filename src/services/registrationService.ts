import { Database } from '../db/database.types';
import { supabase } from '../db/supabase';
import { fetchUserDetails } from './airstackService';
import { sendNewGameDirectCasts } from './directCastService';
import { getAllUserIds } from './gameService';
import { publishNewGameCast } from './publishCastService';

export async function checkMention(castHash: string, fid: number, castText: string) {
    console.log('checking mention: ', castText);
    const pattern = /https:\/\/rps-frame\.vercel\.app\/api\/game\/(\d+)/;
    const match = castText.match(pattern);

    if (!match) return;

    const gameId = parseInt(match[1]);

    const { data: matchedGames, error: matchedGamesError } = await supabase
        .from('games')
        .select('*')
        .eq('sponsor_id', fid)
        .eq('id', gameId)
        .eq('state', 'created');

    if (matchedGamesError) {
        console.error("Error fetching games to start:", matchedGamesError);
        throw matchedGamesError;
    }

    if (matchedGames.length === 0) return;

    const matchedGameId = matchedGames[0].id;

    console.log('mentioned matched for game: ', matchedGameId);

    await startGameRegistration(matchedGameId, castHash, fid);
}

export async function startGameRegistration(gameId: number, registrationCastHash: string, sponsorFid: number) {
    const { error: startRegistrationError } = await supabase
        .from('games')
        .update({
            state: 'registering' as Database["public"]["Enums"]["game_state"],
            cast_hash: registrationCastHash
        })
        .eq('id', gameId)
        .eq('state', 'created');

    if (startRegistrationError) throw startRegistrationError;

    console.log('started registration for game: ', gameId);

    const fids = await getAllUserIds();

    const sponsorDetails = await fetchUserDetails(sponsorFid);
    const sponsorUsername = sponsorDetails.Socials.Social[0].profileName;

    const castLink = `https://warpcast.com/${sponsorUsername}/${registrationCastHash}`;

    await new Promise(resolve => setTimeout(resolve, 1000));

    await sendNewGameDirectCasts(fids, castLink, sponsorUsername);
}



