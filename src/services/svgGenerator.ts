import puppeteer, { BoundingBox } from 'puppeteer';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { mkdirSync } from 'fs';

export async function generateSVG() {
    try {
        console.log('Generating SVG...');
        const browser = await puppeteer.launch({
            headless: false,
            args: ['--disable-web-security', '--no-sandbox']
        });
        const page = await browser.newPage();
        
        console.log('Navigating to page...');
        await page.goto('https://rps-bracketer.vercel.app/bracket/6', {
            waitUntil: 'networkidle0'
        });
        
        console.log('Waiting for SVG element...');
        const svgElement = await page.waitForSelector('#bracketSVG');
        if (!svgElement) throw new Error('SVG element not found');
        
        // Wait for network to be completely idle
        await page.waitForNetworkIdle();
        
        console.log('Waiting for all images to load');
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

        console.log('Giving the page a moment to render everything');
        await new Promise(resolve => setTimeout(resolve, 10000));

        mkdirSync('./brackets', { recursive: true });
        await page.screenshot({
            path: './brackets/bracket.png',
            fullPage: true,
            omitBackground: true
        });

        await browser.close();
    } catch (error) {
        console.error('Error generating SVG:', error);
    }
}