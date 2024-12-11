import axios from "axios";

export async function sendNewGameDirectCasts(fids: number[], castLink: string, sponsorUsername: string) {
    const results = await Promise.allSettled(
        fids.map(fid => sendNewGameDirectCast(fid, castLink, sponsorUsername))
    );

    // Log failures but don't stop execution
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failures.length > 0) {
        console.error(`Failed to send ${failures.length} direct casts:`,
            failures.map(f => f.reason));
    }
}

export async function sendNewGameDirectCast(fid: number, castLink: string, sponsorUsername: string) {
    const idempotencyKey = `${castLink}`;
    const message = `@${sponsorUsername} has sponsored a new tournament! ${castLink}`;
    await sendDirectCast(fid, idempotencyKey, message);
}

export async function sendNewRoundDirectCasts(fids: number[], castLink: string) {
    const results = await Promise.allSettled(
        fids.map(fid => sendNewRoundDirectCast(fid, castLink))
    );

    // Log failures but don't stop execution
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failures.length > 0) {
        console.error(`Failed to send ${failures.length} direct casts:`,
            failures.map(f => f.reason));
    }
}

export async function sendNewRoundDirectCast(fid: number, castLink: string) {
    const idempotencyKey = `${castLink}`;
    const message = `The next round has begun! ${castLink}`;
    await sendDirectCast(fid, idempotencyKey, message);
}

export async function sendFinalDirectCasts(fids: number[], castLink: string) {
    const results = await Promise.allSettled(
        fids.map(fid => sendFinalDirectCast(fid, castLink))
    );

    // Log failures but don't stop execution
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failures.length > 0) {
        console.error(`Failed to send ${failures.length} direct casts:`,
            failures.map(f => f.reason));
    }
}

export async function sendFinalDirectCast(fid: number, castLink: string) {
    const idempotencyKey = `${castLink}`;
    const message = `We have a winner! ${castLink}`;
    await sendDirectCast(fid, idempotencyKey, message);
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

    if (process.env.SEND_DIRECT_CASTS === 'false') {
        console.log(`Skipping direct cast to ${recipientFid}: ${message}`);
        return;
    }

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
            ? `1 hour`
            : `1 hour ${remainingMinutes} ${remainingMinutes === 1 ? 'minute' : 'minutes'}`;
    } else {
        return remainingMinutes === 0
            ? `${hours} hours`
            : `${hours} hours ${remainingMinutes} ${remainingMinutes === 1 ? 'minute' : 'minutes'}`;
    }
}