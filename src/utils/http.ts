import type { IncomingMessage, ServerResponse } from "node:http";

export function sendJson(res:ServerResponse, statusCode: number, payload: unknown): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
}

export function parseJsonBody(req: IncomingMessage, res: ServerResponse): Promise<unknown> {
    return new Promise((resolve) => {
        let body = '';

        req.on('data', (chunk) => {
            body += chunk;
        });

        req.on('end', () => {
            try {
                resolve(JSON.parse(body || '{}'));
            } catch {
                sendJson(res, 400, { error: 'Invalid JSON' });
                resolve(null);
            }
        });

        req.on('error', () => {
            sendJson(res, 400, { error: 'Invalid request body' });
            resolve(null);
        });
    });
}
