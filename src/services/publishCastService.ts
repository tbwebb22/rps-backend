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

Easy to play (it's just rock paper scissors), impossible to master (it's all luck)

🗿 Rock beats Slizards 🦎
🐸 Pepe beats Rock 🗿
🦎 Slizards beats Pepe 🐸

If you want to play:
1) Follow me! I'm a bot 🤖 and will send you a direct casts when you need to make a play
2) Register in the frame below - first 32 registrants get to play
3) All players get placed into a bracket and matched up against opponents in 15 minute matches until we have a winner

May the odds be ever in your favor
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

export async function publishNewRoundCast(gameId: number, round: number) {
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
                url: `https://rps-frame.vercel.app/api/game/${gameId}`
            }
        ]
    });

    console.log(`published new round cast, game: ${gameId}, round: ${round}, hash: ${response.cast.hash}`);
    return response.cast.hash;
}

export async function publishFinalCast(gameId: number, winnerUsername: string) {
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
                url: `https://rps-frame.vercel.app/api/game/${gameId}`
            }
        ]
    });

    console.log(`published game final cast, game: ${gameId}, hash: ${response.cast.hash}`);
    return response.cast.hash;  
}   