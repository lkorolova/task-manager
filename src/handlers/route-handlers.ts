import os from 'node:os';
import readline from 'node:readline';
import path from 'node:path';
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
        'SELECT id, title, description, status, created_at AS "createdAt", updated_at AS "updatedAt", user_id FROM tasks WHERE id = $1',
        [id]
    );

    return result.rows[0];
}

async function insertTaskQuery (task: Task): Promise<Task> {
    const { id, title, description, status, createdAt, updatedAt } = task;
    const result = await pool.query<Task>(`
        INSERT INTO tasks (id, title, description, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, title, description, status, created_at AS "createdAt", updated_at AS "updatedAt"
    `, [id, title, description, status, createdAt, updatedAt]);
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
    const { title, description, status, updatedAt, id } = task;

    const result = await pool.query(`
        UPDATE tasks
        SET title = $1, description = $2, status = $3, updated_at = $4
        WHERE id = $5
        RETURNING id, title, description, status, created_at AS "createdAt", updated_at AS "updatedAt"
    `, [title, description, status, updatedAt, id]);

    const updatedTask = result.rows[0];

    return updatedTask;
}

async function deleteTaskQuery (id: Task['id']): Promise<void> {
    await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
}

async function exportTasksQuery (): Promise<Task[]> {
    const result = await pool.query('SELECT id, title, description, status, created_at AS "createdAt", updated_at AS "updatedAt" FROM tasks');

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