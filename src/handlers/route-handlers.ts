import os from 'node:os';
import readline from 'node:readline';
import { Readable } from 'node:stream';
import type { Request, Response } from 'express';
import { generateId } from '../utils/id-generator.js';
import { taskEventBus } from '../events/task-event-bus.js';
import { tasks, saveTasks } from '../services/task.service.js';
import { parseCsvLine, escapeCsv, CSV_COLUMNS } from '../utils/csv.js';
import type { Task } from '../types/task.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export function getTasks(_req: Request, res: Response): void {
    res.json(tasks);
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

    tasks.push(task);
    await saveTasks();
    res.status(201).json(task);
    taskEventBus.emitTaskCreated(task);
}

export function getTask(req: Request<{ id: string }>, res: Response): void {
    const task = tasks.find((task) => task.id === req.params.id);

    if (task) {
        res.json(task);
    } else {
        res.status(404).json({ error: 'Task not found' });
    }
}

export async function updateTask(req: Request<{ id: string }>, res: Response): Promise<void> {
    const index = tasks.findIndex((task) => task.id === req.params.id);

    if (index === -1) {
        res.status(404).json({ error: 'Task not found' });
        return;
    }

    const updates = req.body;

    tasks[index] = {
        ...tasks[index],
        ...updates,
        id: tasks[index]!.id,
        updatedAt: new Date().toISOString(),
    } as Task;

    await saveTasks();
    res.json(tasks[index]);
    taskEventBus.emitTaskUpdated(tasks[index]);
}

export function deleteTask(req: Request<{ id: string }>, res: Response): void {
    const id = req.params.id;
    const index = tasks.findIndex((task) => task.id === id);

    if (index === -1) {
        res.status(404).json({ error: 'Task not found' });
        return;
    }

    const [deleted] = tasks.splice(index, 1);
    saveTasks()
        .then(async () => {
            res.status(204).end();
            taskEventBus.emitTaskDeleted(deleted!.id);
            await fs.rm(path.join('uploads', id), { recursive: true, force: true });
        })
        .catch(() => {
            res.status(500).json({ error: 'Failed to persist tasks' });
        });
}

export function exportTasks(_req: Request, res: Response): void {
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

        const newTask: Task = {
            id: taskData.id || generateId(),
            title: taskData.title || '',
            description: taskData.description || '',
            status: taskData.status || 'todo',
            createdAt: taskData.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        tasks.push(newTask);
        taskEventBus.emitTaskCreated(newTask);
        importedCount++;
    });

    rl.on('close', async () => {
        try {
            await saveTasks();
            res.status(201).json({ imported: importedCount });
        } catch {
            res.status(500).json({ error: 'Failed to save tasks' });
        }
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
