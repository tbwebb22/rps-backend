import { Request, Response, NextFunction } from 'express';

const VALID_API_KEYS = new Set([
    process.env.ADMIN_API_KEY,
    process.env.SERVER_API_KEY
]);

export const authenticateApiKey = (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.headers['x-api-key'];

    console.log("All environment variables:", process.env);
    console.log("Valid API keys:", VALID_API_KEYS);

    if (!apiKey || !VALID_API_KEYS.has(apiKey as string)) {
        return res.status(401).json({ error: 'Invalid API key' });
    }

    next();
}; 