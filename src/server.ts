import express, { Express } from 'express';
import bodyParser from 'body-parser';
import gameRoutes from './routes/gameRoutes';
import dotenv from 'dotenv';

dotenv.config();

const app: Express = express();
app.use(bodyParser.json());

app.use('/api/games', gameRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
