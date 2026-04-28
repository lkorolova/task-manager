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
import db from '../db/database.js';
import { parsePagination } from '../utils/parse-pagination.js';
const insertTask = db.prepare<[string, string, string, string, string, string]>(`
    INSERT INTO tasks (id, title, description, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
`);
const getTaskStmt = db.prepare<[string], Task>(
    'SELECT id, title, description, status, created_at AS createdAt, updated_at AS updatedAt FROM tasks WHERE id = ?'
);
const getTasksStmt = db.prepare<[number, number], Task>(
    `SELECT id, 
        title, 
        description, 
        status, 
        created_at AS createdAt, 
        updated_at AS updatedAt 
    FROM tasks 
    LIMIT ? OFFSET ?
`);
const updateTaskStmt = db.prepare<{ title: string; description: string; status: string; updatedAt: string; id: string }>(`
    UPDATE tasks SET title = :title, description = :description, status = :status, updated_at = :updatedAt WHERE id = :id
`);
const deleteTaskStmt = db.prepare<[string]>(`
    DELETE FROM tasks WHERE id = ?
`);
const exportTasksStmt = db.prepare<[], Task>(
    `SELECT id, title, description, status, created_at AS createdAt, updated_at AS updatedAt FROM tasks`
);
const getUserTasksStmt = db.prepare<[string], Task & { username: string }>(`
    SELECT tasks.id, tasks.title, tasks.description, tasks.status, tasks.created_at AS createdAt, tasks.updated_at AS updatedAt,users.username FROM tasks
    JOIN users ON users.id = tasks.user_id
    WHERE users.id = ?
`);

export function getTasks(req: Request, res: Response): void {
    const { page, limit } = parsePagination(req.query);
    const offset = (page - 1) * limit;

    const tasks = getTasksStmt.all(limit, offset);

    res.json({ page, limit, data: tasks });
}

export function createTask(req: Request, res: Response): void {
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
        insertTask.run(
            task.id, 
            task.title, 
            task.description, 
            task.status, 
            task.createdAt, 
            task.updatedAt
        );
    } catch (err) {
        res.status(500).json({ error: err });
        return;
    }

    res.status(201).json(task);
    taskEventBus.emitTaskCreated(task);
}

export function getTask(req: Request<{ id: string }>, res: Response): void {
    const task = getTaskStmt.get(req.params.id);

    if (task) {
        res.json(task);
    } else {
        res.status(404).json({ error: 'Task not found' });
    }
}

export function updateTask(req: Request<{ id: string }>, res: Response): void {
    const id = req.params.id;
    const task = getTaskStmt.get(id);

    if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
    }

    const updates = req.body;
    const updatedTask = {
        ...task,
        ...updates,
    };

    try {
        updateTaskStmt.run({
            title: updatedTask.title,
            description: updatedTask.description,
            status: updatedTask.status,
            updatedAt: new Date().toISOString(),
            id: id,
        })
    } catch (err) {
        res.status(500).json({err: err});
        return;
    }
    
    res.json(updatedTask);
    taskEventBus.emitTaskUpdated(updatedTask);
}

export async function deleteTask(req: Request<{ id: string }>, res: Response): Promise<void> {
    const id = req.params.id;

    try {
        deleteTaskStmt.run(id);
        res.status(204).end();
        taskEventBus.emitTaskDeleted(id);
        await fs.rm(path.join('uploads', id), { recursive: true, force: true });
    } catch (err) {
        res.status(500).json({ err: err });
    }
}

export function exportTasks(_req: Request, res: Response): void {
    const tasks = exportTasksStmt.all() as Task[];

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

    rl.on('line', (line) => {
        if (isFirstLine) {
            headers = parseCsvLine(line);
            isFirstLine = false;
            return;
        }

        if (!line.trim()) return;

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

        try {
            insertTask.run(
                task.id, 
                task.title, 
                task.description, 
                task.status, 
                task.createdAt, 
                task.updatedAt
            );
            taskEventBus.emitTaskCreated(task);
            importedCount++;
        } catch (err) {
            res.status(500).json({ err: err });
            return;
        }
    });

    rl.on('close', () => {
        res.status(201).json({ imported: importedCount });
    });

    rl.on('error', () => {
        res.status(400).json({ error: 'Invalid CSV format' });
    });
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

export function uploadAttachment(req: Request<{ id: string }>, res: Response): void {
    if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
    }
    res.status(201).json({ filename: req.file.filename });
}

export async function getAttachment(req: Request<{ id: string, filename: string}>, res: Response) {
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

export function getUserTasks(req: Request<{ id: string }>, res: Response) {
    const userId = req.params.id;

    try {
        const tasks = getUserTasksStmt.all(userId)
        res.json(tasks);
    } catch {
        res.status(500).json({ error: 'Error getting user tasks' });
    }
}