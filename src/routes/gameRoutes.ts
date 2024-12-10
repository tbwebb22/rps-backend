import express from 'express';
import { createGame, registerForGame, makePlay, processGames, test, mention } from '../controllers/gameController';
import { getGameStatus, getCreateGameStatus } from '../services/gameService';

const router = express.Router();

const asyncHandler = (fn: Function) => (req: express.Request, res: express.Response, next: express.NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

router.post('/create', asyncHandler(createGame));
router.post('/register', asyncHandler(registerForGame));
router.post('/play', asyncHandler(makePlay));
router.post('/process', asyncHandler(processGames));
router.post('/test', asyncHandler(test));
router.post('/mention', asyncHandler(mention));
router.get('/:gameId/status/:userId', async (req, res) => {
  const { gameId, userId } = req.params;

  try {
    const gameStatus = await getGameStatus(gameId, userId);
    res.json(gameStatus);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'An unknown error occurred' });
  }
});

router.get('/createStatus', async (req, res) => {
  try {
    const status = await getCreateGameStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'An unknown error occurred' });
  }
});

export default router;
