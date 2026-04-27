import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import helmet from 'helmet';
import cors from 'cors';
import type { Express } from 'express';
import router from './routes/task.route.js';
import { requestId } from './middleware/request-id.js';
import responseTime from './middleware/response-time.js';
import { errorHandler } from './middleware/error-handler.js';

const allowedOrigins = process.env.CORS_ORIGINS?.split(',').map((string)=> string.trim()) ?? [];
const app: Express = express();

app.use(express.json());
app.use(morgan('dev'));
app.use(cors({ origin: allowedOrigins }));
app.use(helmet());
app.use(requestId);
app.use(responseTime);
app.use(express.static('public'));
app.use(router);
app.use(errorHandler);

export default app;