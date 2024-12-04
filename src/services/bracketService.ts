import dotenv from 'dotenv';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

dotenv.config();

export async function generateBracket(gameId: string, round: string) {
    console.log(`generating bracket, game: ${gameId}, round: ${round}`);
    try {
        console.log('Generating SVG...');
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--disable-web-security', '--no-sandbox']
        });
        const page = await browser.newPage();
        
        await page.goto(`https://rps-bracketer.vercel.app/bracket/${gameId}`, {
            waitUntil: 'networkidle0'
        });
        
        const svgElement = await page.waitForSelector('#bracketSVG');
        if (!svgElement) throw new Error('SVG element not found');
        
        // Wait for network to be completely idle
        await page.waitForNetworkIdle();
        
        await page.evaluate(() => {
            const images = document.querySelectorAll('image');
            return Promise.all(Array.from(images).map((img) => {
                const href = img.getAttribute('href') || img.getAttribute('xlink:href');
                if (!href) return Promise.resolve();
                
                return new Promise((resolve, reject) => {
                    const image = new Image();
                    image.onload = resolve;
                    image.onerror = reject;
                    image.src = href;
                });
            }));
        });

        await new Promise(resolve => setTimeout(resolve, 5000));

        mkdirSync('./brackets', { recursive: true });
        // Set higher device scale factor for better quality (2 = 2x, 3 = 3x, 4 = 4x resolution)
        const viewport = page.viewport() || { width: 1920, height: 1080 };
        await page.setViewport({
            width: viewport.width,
            height: viewport.height,
            deviceScaleFactor: 4
        });

        const screenshotBuffer = await page.screenshot({
            fullPage: true,
            omitBackground: true
        });

        // Initialize S3 client with Cloudflare R2 endpoint
        const s3Client = new S3Client({
            region: 'auto',
            endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: process.env.R2_ACCESS_KEY_ID!,
                secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!
            }
        });

        // Upload to S3
        await s3Client.send(new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME!,
            Key: `bracket-${gameId}-${round}.png`,
            Body: screenshotBuffer,
            ContentType: 'image/png'
        }));

        const publicUrl = `${process.env.R2_BUCKET_PUBLIC_URL_PREFIX}bracket-${gameId}-${round}.png`;

        console.log('Bracket generated and uploaded to:', publicUrl);

        await browser.close();

        return publicUrl;
    } catch (error) {
        console.error('Error generating or uploading image:', error);
        throw error;
    }
}