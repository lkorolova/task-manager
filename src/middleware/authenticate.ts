import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { JwtPayload } from '../types/user.js';

const TOKEN_SECRET = process.env['TOKEN_SECRET'];

function extractBearerToken(authorizationHeader: string | undefined): string | null {
    if (!authorizationHeader) {
        return null;
    }

    const [scheme, token, ...rest] = authorizationHeader.split(' ');
    if (scheme !== 'Bearer' || !token || rest.length > 0) {
        return null;
    }

    return token;
}

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
    if (!TOKEN_SECRET) {
        res.status(500).json({ error: 'Server configuration error' });
        return;
    }

    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    try {
        const decoded = jwt.verify(token, TOKEN_SECRET);

        if (typeof decoded === 'string' || !('userId' in decoded)) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const payload = decoded as JwtPayload;

        req.user = {
            id: payload.userId,
            role: payload.userRole,
        };

        next();
    } catch {
        res.status(401).json({ error: 'Unauthorized' });
    }
};