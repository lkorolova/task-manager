import http from 'node:http';
import app from './app.js';

export const server = http.createServer(app);
