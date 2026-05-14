import os from 'node:os';
import readline from 'node:readline';
import path from 'node:path';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Readable } from 'node:stream';
import type { Request, Response } from 'express';
import { generateId } from '../utils/id-generator.js';
import { taskEventBus } from '../events/task-event-bus.js';
import { parseCsvLine, escapeCsv, CSV_COLUMNS } from '../utils/csv.js';
import type { Task } from '../types/task.js';
import { promises as fs } from 'node:fs';
import { parsePagination } from '../utils/parse-pagination.js';
import pool from '../db/pg-database.js';
import type { Comment } from '../types/comment.js';
import type { JwtConfig, JwtPayload, User } from '../types/user.js';
import { hashRefreshToken } from '../utils/hash-refresh-token.js';
import { readCookie } from '../utils/read-cookie.js';
import { isAuthorized } from '../utils/is-authorized.js';

const TOKEN_SECRET = process.env['TOKEN_SECRET'];
const ACCESS_TTL = '15m';
const REFRESH_TTL_DAYS = 7;


export async function getTasks(req: Request, res: Response): Promise<void> {
    const { page, limit } = parsePagination(req.query);
    const offset = (page - 1) * limit;

    const tasks = await getTasksQuery(limit, offset);

    res.json({ page, limit, data: tasks });
}

export async function createTask(req: Request, res: Response): Promise<void> {
    const body = req.body;

    const task: Task = {
        id: generateId(),
        title: body.title,
        description: body.description,
        status: 'todo',
        userId: req.user!.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    try {
        await insertTaskQuery(task);
    } catch (err) {
        res.status(500).json({ error: err });
        return;
    }

    res.status(201).json(task);
    taskEventBus.emitTaskCreated(task);
}

export async function getTask(req: Request<{ id: Task['id'] }>, res: Response): Promise<void> {
    const task = await getTaskQuery(req.params.id);

    if (task) {
        res.json(task);
    } else {
        res.status(404).json({ error: 'Task not found' });
    }
}

export async function updateTask(req: Request<{ id: Task['id'] }>, res: Response): Promise<void> {
    const id = req.params.id;
    const task = await getTaskQuery(id);

    if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
    }

    if(!isAuthorized(req.user!.role, req.user!.id, task.userId)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }

    const updates = req.body;
    const updatedValues = {
        ...task,
        ...updates,
    };

    try {
        const updatedTask = await updateTaskQuery(updatedValues);
        res.json(updatedTask);
        taskEventBus.emitTaskUpdated(updatedTask);
    } catch (err) {
        res.status(500).json({err: err});
    }
}

export async function deleteTask(req: Request<{ id: Task['id'] }>, res: Response): Promise<void> {
    const id = req.params.id;

    if (!isAuthorized(req.user!.role, req.user!.id, req.task!.userId)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }

    try {
        await deleteTaskQuery(id);
        res.status(204).end();
        taskEventBus.emitTaskDeleted(id);
        await fs.rm(path.join('uploads', id), { recursive: true, force: true });
    } catch (err) {
        res.status(500).json({ err: err });
    }
}

export async function exportTasks(_req: Request, res: Response): Promise<void> {
    const tasks = await exportTasksQuery() as Task[];

    const headerLine = CSV_COLUMNS.join(',') + '\n';
    const rowLines = tasks.map(
        (task) => CSV_COLUMNS.map((col) => escapeCsv(task[col])).join(',') + '\n'
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="tasks.csv"');

    const csvStream = Readable.from([headerLine, ...rowLines]);

    csvStream.on('error', () => {
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to export tasks' });
        } else {
            res.destroy();
        }
    });

    csvStream.pipe(res);
}

export async function importTasks(req: Request, res: Response): Promise<void> {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('text/csv')) {
        res.status(415).json({ error: 'Content-Type must be text/csv' });
        return;
    }

    const rl = readline.createInterface({
        input: req,
        crlfDelay: Infinity,
    });

    let importedCount = 0;
    let isFirstLine = true;
    let headers: string[] = [];

    try {
        for await (const line of rl) {
            if (isFirstLine) {
                headers = parseCsvLine(line);
                isFirstLine = false;
                continue;
            }

            if (!line.trim()) {
                continue;
            }

            const fields = parseCsvLine(line);
            const taskData: Partial<Task> = {};

            headers.forEach((header, index) => {
                (taskData as Record<string, string>)[header] = fields[index] || '';
            });

            const task: Task = {
                id: generateId(),
                title: taskData.title || '',
                description: taskData.description || '',
                status: taskData.status || 'todo',
                userId: taskData.userId || '',
                createdAt: taskData.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            await insertTaskQuery(task);
            taskEventBus.emitTaskCreated(task);
            importedCount++;
        }

        res.status(201).json({ imported: importedCount });
    } catch (err) {
        res.status(500).json({ err: err });
    }
}

export function getHealth(_req: Request, res: Response): void {
    res.json({ status: 'ok', uptime: process.uptime() });
}

export function getInfo(_req: Request, res: Response): void {
    res.json({
        nodeVersion: process.version,
        platform: os.platform(),
        memoryUsage: process.memoryUsage(),
    });
}

export function uploadAttachment(req: Request<{ id: Task['id'] }>, res: Response): void {
    if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
    }
    res.status(201).json({ filename: req.file.filename });
}

export async function getAttachment(req: Request<{ id: Task['id'], filename: string}>, res: Response) {
    const { id, filename } = req.params;

    if(filename.includes('/') || filename.includes('\\')) {
        res.status(400).json({ error: 'Invalid filename' });
        return;
    }

    const base = path.resolve('uploads', id);
    const target = path.resolve(base, filename);

    if(!target.startsWith(base + path.sep)) {
        res.status(400).json({error: 'Invalid filename'});
        return;
    }

    try {
        await fs.access(target);
    } catch {
        res.status(404).json({ error: 'File not found' });
        return;
    }

    res.sendFile(target);
}

export async function getUserTasks(req: Request<{ id: Task['id'] }>, res: Response) {
    const userId = req.params.id;

    try {
        const tasks = await getUserTasksQuery(userId);
        res.json(tasks);
    } catch {
        res.status(500).json({ error: 'Error getting user tasks' });
    }
}

export async function createComment(req: Request<{ id: Task['id'] }>, res: Response): Promise<void> {
    const taskId = req.params.id;
    const body = req.body;

    const comment: Comment = {
        id: generateId(),
        taskId,
        body: body.comment,
        createdAt: new Date().toISOString(),
    };

    try {
        const createdComment = await createCommentQuery(comment);
        res.status(201).json(createdComment);
    } catch (err) {
        res.status(500).json({ error: err });
        return;
    }
}

export async function getTaskComments(req: Request<{ id: Task['id'] }>, res: Response): Promise<void> {
    const taskId = req.params.id;

    try {
        const comments = await getTaskCommentsQuery(taskId);
        res.json(comments);
    } catch (err) {
        res.status(500).json({ error: err });
    }
}

export async function getTaskQuery(id: Task['id']) {
    const result = await pool.query<Task>(
        `SELECT id, title, description, status, 
            user_id as "userId", 
            created_at AS "createdAt", 
            updated_at AS "updatedAt" 
        FROM tasks WHERE id = $1`,
        [id]
    );

    return result.rows[0];
}

async function insertTaskQuery (task: Task): Promise<Task> {
    const { id, title, description, status, userId, createdAt, updatedAt } = task;
    const result = await pool.query<Task>(`
        INSERT INTO tasks (id, title, description, status, user_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, title, description, status, user_id AS "userId", created_at AS "createdAt", updated_at AS "updatedAt"
    `, [id, title, description, status, userId, createdAt, updatedAt]);
    return result.rows[0] as Task;
}

async function getTasksQuery (limit: number, offset: number): Promise<Task[]> {
    const result = await pool.query<Task>(`
        SELECT id,
            title,
            description,
            status,
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        FROM tasks
        LIMIT $1 OFFSET $2
    `,
        [limit, offset]
    );

    const tasks = result.rows;

    return tasks;
}

async function updateTaskQuery (task: Task): Promise<Task> {
    const { title, description, status, id } = task;

    const result = await pool.query(`
        UPDATE tasks
        SET title = $1, description = $2, status = $3, updated_at = NOW()
        WHERE id = $4
        RETURNING id, title, description, status, created_at AS "createdAt", updated_at AS "updatedAt"
    `, [title, description, status, id]);

    const updatedTask = result.rows[0];

    return updatedTask;
}

async function deleteTaskQuery (id: Task['id']): Promise<void> {
    await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
}

async function exportTasksQuery (): Promise<Task[]> {
    const result = await pool.query('SELECT id, title, description, status, user_id AS "userId", created_at AS "createdAt", updated_at AS "updatedAt" FROM tasks');

    return result.rows;
}

async function getUserTasksQuery (userId: string): Promise<Task[]> {
    const result = await pool.query(`
            SELECT tasks.id,
                tasks.title,
                tasks.description,
                tasks.status,
                tasks.created_at AS "createdAt",
                tasks.updated_at AS "updatedAt",
                users.username
            FROM tasks
            JOIN users ON users.id = tasks.user_id
            WHERE users.id = $1
        `,
        [userId]
    );

    return result.rows;
}

async function createCommentQuery (comment: Comment): Promise<Comment> {
    const { id, taskId, body, createdAt } = comment;

    const result = await pool.query<Comment>(`
        INSERT INTO comments (id, task_id, body, created_at)
        VALUES ($1, $2, $3, $4)
        RETURNING id, task_id AS "taskId", body, created_at AS "createdAt"
    `, [id, taskId, body, createdAt]);

    const createdComment = result.rows[0];
    if (!createdComment) {
        throw new Error('Failed to create comment');
    }

    return createdComment;
}

async function getTaskCommentsQuery (taskId: Task['id']): Promise<Comment[]> {
    const result = await pool.query<Comment>(`
            SELECT comments.id,
                comments.task_id AS "taskId",
                comments.body,
                comments.created_at AS "createdAt"
            FROM comments
            WHERE comments.task_id = $1
        `,
        [taskId]
    );

    return result.rows;
}

export async function createUser(req: Request, res: Response): Promise<void> {
    const body = req.body;
    const SALT_ROUNDS = 12;
    const hashedPassword = await bcrypt.hash(body.password, SALT_ROUNDS);

    const user: User = {
        id: generateId(),
        username: body.username,
        email: body.email,
        role: 'user',
        passwordHash: hashedPassword,
        createdAt: new Date().toDateString(),
    }

    try {
        await insertUserQuery(user);
    } catch (err) {
        res.status(500).json({error: err})
        return;
    }

    res.status(201).json('User has been created');
}

async function insertUserQuery(userData: User): Promise<void> {
    const {id, username, email, role, passwordHash, createdAt} = userData;
    await pool.query(`
        INSERT INTO users (id, username, email, role, password_hash, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
    `, [id, username, email, role, passwordHash, createdAt]);
}

export async function login(req: Request, res: Response): Promise<void>{
    const { email, password } = req.body;

    const userData: User = await getUserQuery(email);

    if (!userData) {
        res.status(400).json("Invalid credentials");
        return;
    }

    const userId = userData.id;
    const isPasswordValid = await bcrypt.compare(password, userData.passwordHash);

    if (!isPasswordValid) {
        res.status(400).json("Invalid credentials");
        return;
    }

    if (!TOKEN_SECRET) {
        res.status(500).json("Server configuration error");
        return;
    }

    const tokenPayload: JwtPayload = { userId: userData.id, userRole: userData.role };

    const tokenConfig: JwtConfig = {
        access: {
            expiresIn: ACCESS_TTL,
        },
        refresh: {
            expiresIn: `${REFRESH_TTL_DAYS}d`,
        }
    }

    const accessToken = jwt.sign(
        tokenPayload, 
        TOKEN_SECRET,
        tokenConfig.access
    );

    const refreshToken = jwt.sign(
        tokenPayload, 
        TOKEN_SECRET,
        tokenConfig.refresh
    );
    const refreshTokenHash = hashRefreshToken(refreshToken);

    try {
        await insertRefreshTokenQuery(refreshTokenHash, userId)
    } catch (err) {
        res.status(500).json({error: err});
        return;
    }

    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
    });
    res.json({accessToken});
}

async function getUserQuery(email: User['email']) {
    const result = await pool.query(`
        SELECT id, email, role, password_hash AS "passwordHash" FROM users WHERE email = $1
    `, [email]);
    return result.rows[0];
}

async function insertRefreshTokenQuery (hash: string, userId: User['id']): Promise<void> {
    await pool.query(`
        INSERT INTO tokens (id, user_id, token_hash, expires_at)
        VALUES ($1, $2, $3, NOW() + INTERVAL '7 days');
    `, [generateId(), userId, hash]);
}

export async function refresh(req: Request, res: Response): Promise<void> {
    if(!TOKEN_SECRET) {
        res.status(500).json({ error: 'Server configuration error' });
        return;
    }
    
    const refreshToken = readCookie(req.headers.cookie, 'refreshToken');
    if(!refreshToken) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    try {
        const decoded = jwt.verify(refreshToken, TOKEN_SECRET);

        if (typeof decoded === 'string' || !('userId' in decoded)) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const tokenHash = hashRefreshToken(refreshToken);
        const tokenRow = await getValidRefreshTokenByHashQuery(tokenHash);

        if(!tokenRow) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const payload: JwtPayload = {
            userId: (decoded as JwtPayload).userId,
            userRole: (decoded as JwtPayload).userRole,
        };
        const accessToken = jwt.sign(payload, TOKEN_SECRET, { expiresIn: ACCESS_TTL});

        res.json({ accessToken });
    } catch {
        res.status(401).json({ error: 'Unauthorized' });
    }
}

async function getValidRefreshTokenByHashQuery(tokenHash: string) {
    const result = await pool.query(
        `SELECT id, user_id AS "userId", expires_at AS "expiresAt"
         FROM tokens
         WHERE token_hash = $1
           AND revoked_at IS NULL
           AND expires_at > NOW()
         LIMIT 1`,
        [tokenHash]
    );
    return result.rows[0];
}

export async function logout (req: Request, res: Response) {
    const refreshToken = readCookie(req.headers.cookie, 'refreshToken');

    if (refreshToken) {
        const tokenHash = hashRefreshToken(refreshToken);
        await revokeRefreshTokenByHashQuery(tokenHash);
    }

    res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env['NODE_ENV'] === 'production',
        sameSite: 'strict',
    });

    res.status(204).end();
}

async function revokeRefreshTokenByHashQuery(tokenHash: string): Promise<void> {
    await pool.query(
        `
        UPDATE tokens
        SET revoked_at = NOW()
        WHERE token_hash = $1
          AND revoked_at IS NULL
        `,
        [tokenHash]
    );
}