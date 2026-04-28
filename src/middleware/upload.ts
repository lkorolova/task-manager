import multer from "multer";
import path from "node:path";
import { promises as fs } from 'node:fs';
import type { Request, Response, NextFunction } from 'express';
import db from '../db/database.js';

const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'application/pdf'];

const storage = multer.diskStorage({
    destination: (req, _file, cb) => {
        const id = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'] || '';
        cb(null, path.join('uploads', id!));
    },
    filename: (_req, file, cb) => {
        cb(null, file.originalname);
    },
});

export const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024
    },
    fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIMES.includes(file.mimetype)) {
            cb(Object.assign(new Error('Unsupported file type'), { status: 415 }));
            return;
        }
        cb(null, true);
    }
});

export const ensureUploadDir = async (req: Request, _res: Response, next: NextFunction) => {
    const id: string = Array.isArray(req.params['id']) ? req.params['id'][0]! : (req.params['id'] ?? '');

    await fs.mkdir(path.join('uploads', id), { recursive: true });
    next();
};

export const ensureTaskExists = (req: Request, res: Response, next: NextFunction) => {
    const id: string = Array.isArray(req.params['id']) ? req.params['id'][0]! : (req.params['id'] ?? '');

    const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(id);
    if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
    }

    next();
}