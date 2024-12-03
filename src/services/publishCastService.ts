import { NeynarAPIClient } from "@neynar/nodejs-sdk";

const neynar = new NeynarAPIClient({
    apiKey: process.env.NEYNAR_API_KEY!
});

export async function publishCast(cast: string) {
    await neynar.publishCast({
        signerUuid: process.env.SIGNER_UUID!,
        text: cast
    });
}