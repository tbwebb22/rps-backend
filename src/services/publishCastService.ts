import { NeynarAPIClient } from "@neynar/nodejs-sdk";

const neynar = new NeynarAPIClient({
    apiKey: process.env.NEYNAR_API_KEY!
});

export async function testReplyCast() {
    console.log(`testing reply cast`);
    const parentHash = '0x27a128b12897841289031e65ce0d583188831b0f';
    const response = await neynar.publishCast({
        signerUuid: process.env.SIGNER_UUID!,
        parent: parentHash,
        text: `Test reply`,
        channelId: 'rockpepeslizards',
        embeds: []
    });

    return response.cast.hash;
}

// TODO: need these matches to have player usernames
export async function publishNewRoundCast(gameId: number, round: number, parentCastHash: string, matches: {
    round_id: number;
    player1_id: number;
    player2_id: number | null;
}[]) {
    console.log(`publishing new round cast, game: ${gameId}, round: ${round}`);
    const response = await neynar.publishCast({
        signerUuid: process.env.SIGNER_UUID!,
        parent: parentCastHash,
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

export async function publishFinalCast(gameId: number, parentCastHash: string, winnerUsername: string) {
    console.log(`publishing game final cast, game: ${gameId}`);
    const response = await neynar.publishCast({
        signerUuid: process.env.SIGNER_UUID!,
        parent: parentCastHash,
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

// export async function publishNewGameCast(gameId: number, sponsorUsername: string, parentCastHash: string) {
//     console.log(`publishing new game cast, game: ${gameId}`);
//     const response = await neynar.publishCast({
//         signerUuid: process.env.SIGNER_UUID!,
//         text:
//             `@${sponsorUsername} has sponsored and launched Tournament #${gameId}!

// Easy to play (it's just rock paper scissors), impossible to master (it's all luck)

// 🗿 Rock beats Slizards 🦎
// 🐸 Pepe beats Rock 🗿
// 🦎 Slizards beats Pepe 🐸

// If you want to play:
// 1) Follow me! I'm a bot 🤖 and will send you a direct casts when you need to make a play
// 2) Register in the frame below - first 32 registrants get to play
// 3) All players get placed into a bracket and matched up against opponents in 15 minute matches until we have a winner

// May the odds be ever in your favor
// `,
//         channelId: 'rockpepeslizards',
//         embeds: [
//             {
//                 url: `https://rps-frame.vercel.app/api/game/${gameId}`
//             }
//         ]
//     });

//     console.log(`published game cast, game: ${gameId}, hash: ${response.cast.hash}`);
//     return response.cast.hash;
// }