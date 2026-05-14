import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import helmet from 'helmet';
import cors from 'cors';
import type { Express, Request, Response } from 'express';
import taskRouter from './routes/task.route.js';
import authRouter from './routes/auth.route.js';
import { getAllowedMethods } from './router.js';
import { requestId } from './middleware/request-id.js';
import responseTime from './middleware/response-time.js';
import { errorHandler } from './middleware/error-handler.js';

const allowedOrigins = process.env['CORS_ORIGINS']?.split(',').map((string)=> string.trim()) ?? [];
const app: Express = express();

app.use(express.json());
app.use(morgan('dev'));
app.use(cors({ origin: allowedOrigins }));
app.use(helmet());
app.use(requestId);
app.use(responseTime);
app.use(express.static('public'));
app.use(taskRouter);
app.use(authRouter);
app.use((req: Request, res: Response) => {
	const allowedMethods = getAllowedMethods(req.path);
	if (allowedMethods.length > 0 && !allowedMethods.includes(req.method)) {
		res.set('Allow', allowedMethods.join(', '));
		res.status(405).json({ error: 'Method not allowed' });
		return;
	}
	res.status(404).json({ error: 'Not found' });
});
app.use(errorHandler);

export default app;