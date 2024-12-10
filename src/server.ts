import express, { Express, Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import gameRoutes from './routes/gameRoutes';
import dotenv from 'dotenv';
import { init } from "@airstack/node";
import { authenticateApiKey } from './middleware/auth';
import cron from 'node-cron';
import { _processGames } from './services/gameService';

dotenv.config();
init(process.env.AIRSTACK_API_KEY || "");

const app: Express = express();
app.use(bodyParser.json());

// Run at 30 seconds past every 5th minute
cron.schedule('30 */5 * * * *', async () => {
    try {
        await _processGames();
        console.log('Cron job:Processing games at:', new Date().toISOString());
    } catch (error) {
        console.error('Cron job failed:', error);
    }
});

app.use((req: Request, res: Response, next: NextFunction) => {
    // Skip authentication for mention endpoint
    if (req.path === '/api/games/mention') {
        return next();
    }

    // Authenticate all other POST/GET requests
    if (req.method === 'POST' || req.method === 'GET') {
        authenticateApiKey(req, res, next);
    } else {
        next();
    }
});

app.use('/api/games', gameRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
