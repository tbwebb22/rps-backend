import express from 'express';
import { createGame, registerForGame, makePlay, processGames } from '../controllers/gameController';

const router = express.Router();

const asyncHandler = (fn: Function) => (req: express.Request, res: express.Response, next: express.NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

router.post('/create', asyncHandler(createGame));
router.post('/register', asyncHandler(registerForGame));
router.post('/play', asyncHandler(makePlay));
router.post('/process', asyncHandler(processGames));

export default router;
