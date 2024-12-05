import { NeynarAPIClient } from "@neynar/nodejs-sdk";

const neynar = new NeynarAPIClient({
    apiKey: process.env.NEYNAR_API_KEY!
});

export async function publishNewGameCast(gameId: number) {
    console.log(`publishing new game cast, game: ${gameId}`);
    const response = await neynar.publishCast({
        signerUuid: process.env.SIGNER_UUID!,
        text: 
`Tournament #${gameId} has been created!

Register in the frame below
🗿🐸🦎
`,
        channelId: 'rockpepeslizards',
        embeds: [
            {
                url: `https://rps-frame.vercel.app/api/game/${gameId}`
            }
        ]
    });

    console.log(`published game cast, game: ${gameId}, hash: ${response.cast.hash}`);
    return response.cast.hash;
}

export async function publishNewRoundCast(gameId: number, round: number, bracketImageUrl: string) {
    console.log(`publishing new round cast, game: ${gameId}, round: ${round}`);
    const response = await neynar.publishCast({
        signerUuid: process.env.SIGNER_UUID!,
        text: 
`Tournament #${gameId} // Round ${round}

🗿🐸🦎
`,
        channelId: 'rockpepeslizards',
        embeds: [
            {
                url: bracketImageUrl
            },
            {
                url: `https://rps-frame.vercel.app/api/game/${gameId}`
            }
        ]
    });

    console.log(`published new round cast, game: ${gameId}, round: ${round}, hash: ${response.cast.hash}`);
    return response.cast.hash;
}

export async function publishFinalCast(gameId: number, winnerUsername: string, bracketImageUrl: string) {
    console.log(`publishing game final cast, game: ${gameId}`);
    const response = await neynar.publishCast({
        signerUuid: process.env.SIGNER_UUID!,
        text: 
`We have our winner of Tournament #${gameId}!

Congrats @${winnerUsername} 🎉

🗿🐸🦎
`,
        channelId: 'rockpepeslizards',
        embeds: [
            {
                url: bracketImageUrl
            }
        ]
    });

    console.log(`published game final cast, game: ${gameId}, hash: ${response.cast.hash}`);
    return response.cast.hash;  
}   