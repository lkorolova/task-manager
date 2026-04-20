import http from 'node:http';
import { matchRoute, getAllowedMethods } from './router.js';
import { sendJson } from './utils/http.js';

import type { HttpMethod } from './types/task.js';

export const server = http.createServer((request, response) => {
    const method = (request.method || 'GET') as HttpMethod;
    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    
    const match = matchRoute(method, pathname);

    if (match) {
        match.handler({ req: request, res: response, params: match.params });
    } else {
        const allowedMethods = getAllowedMethods(pathname);

        if (allowedMethods.length > 0) {
            response.writeHead(405, {
                'Content-Type': 'application/json',
                Allow: allowedMethods.join(', ')
            });
            response.end(JSON.stringify({ error: 'Method not allowed' }));
            return;
        }

        sendJson(response, 404, { error: 'Not found' });
    }
});