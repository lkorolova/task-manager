import { info, warn, error } from './utils/logger.js';

const port = process.env.PORT || 3000;

info('Task Manager starting');
if (!process.env.PORT) {
	warn('PORT is not set, falling back to default port 3000');
}

process.on('uncaughtException', (err) => {
	error('Uncaught exception', err);
});

info(`Server port configured: ${port}`);
