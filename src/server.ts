import express, { Express, Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import gameRoutes from './routes/gameRoutes';
import dotenv from 'dotenv';
import { init } from "@airstack/node";
import { authenticateApiKey } from './middleware/auth';
import { _processGames } from './services/gameService';

dotenv.config();
init(process.env.AIRSTACK_API_KEY || "");

const app: Express = express();
app.use(bodyParser.json());

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
