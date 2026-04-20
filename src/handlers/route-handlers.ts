import os from 'node:os';
import readline from 'node:readline';
import { Readable } from 'node:stream';
import { generateId } from '../utils/id-generator.js';
import { sendJson, parseJsonBody } from '../utils/http.js';
import { taskEventBus } from '../events/task-event-bus.js';
import { tasks, saveTasks } from '../services/task.service.js';
import { parseCsvLine, escapeCsv, CSV_COLUMNS } from '../utils/csv.js';
import type { Task, TaskService } from '../types/task.js';

function isValidTaskInput(value: unknown): value is Pick<Task, 'title' | 'description' | 'status'> {
    if (typeof value !== 'object' || value === null) return false;
    const v = value as Record<string, unknown>;
    return typeof v.title === 'string';
}

function isValidTaskUpdate(value: unknown): value is Partial<Pick<Task, 'title' | 'description' | 'status'>> {
    if (typeof value !== 'object' || value === null) return false;
    const v = value as Record<string, unknown>;
    return (['title', 'description', 'status'] as const).every(
        (key) => !(key in v) || typeof v[key] === 'string'
    );
}

export function getTasks({res}: TaskService): void  {
    sendJson(res, 200, tasks);
}

export async function createTask({req, res}: TaskService): Promise<void> {
    const body = await parseJsonBody(req, res);
    if (!isValidTaskInput(body)) {
        sendJson(res, 400, { error: 'Invalid task body: title is required' });
        return;
    }
    const taskData = body;

    const task: Task = {
        id: generateId(),
        title: taskData.title || '',
        description: taskData.description || '',
        status: 'todo',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    tasks.push(task);
    await saveTasks();
    sendJson(res, 201, task);
    taskEventBus.emitTaskCreated(task);
}

export function getTask({res, params: { id } = {}}: TaskService): void {
    const task = tasks.find((task) => task.id === id);

    if (task) {
        sendJson(res, 200, task);
    } else {
        sendJson(res, 404, { error: 'Task not found' });
    }
}

export async function updateTask({req, res, params: { id } = {}}: TaskService): Promise<void> {
    const index = tasks.findIndex((task) => task.id === id);

    if (index === -1) {
        sendJson(res, 404, { error: 'Task not found' });
        return;
    }

    const updates = await parseJsonBody(req, res);
    if (!isValidTaskUpdate(updates)) {
        sendJson(res, 400, { error: 'Invalid update body' });
        return;
    }

    tasks[index] = {
        ...tasks[index],
        ...updates,
        id: tasks[index]!.id,
        updatedAt: new Date().toISOString(),
    } as Task;

    await saveTasks();
    sendJson(res, 200, tasks[index]);
    taskEventBus.emitTaskUpdated(tasks[index]);
}

export function deleteTask({res, params: { id } = {}}: TaskService): void {
    if (!id) {
        sendJson(res, 400, { error: 'Missing task id' });
        return;
    }

    const index = tasks.findIndex((task) => task.id === id);

    if (index === -1) {
        sendJson(res, 404, { error: 'Task not found' });
        return;
    }

    tasks.splice(index, 1);
    saveTasks()
        .then(() => {
            res.writeHead(204, { 'Content-Type': 'application/json' });
            res.end();
            taskEventBus.emitTaskDeleted(id);
        })
        .catch(() => {
            sendJson(res, 500, { error: 'Failed to persist tasks' });
        });
}

export function exportTasks({res}: TaskService): void {
    const headerLine = CSV_COLUMNS.join(',') + '\n';
    const rowLines = tasks.map(
        (task) => CSV_COLUMNS.map((col) => escapeCsv(task[col])).join(',') + '\n'
    );

    res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="tasks.csv"',
    });

    const csvStream = Readable.from([headerLine, ...rowLines]);

    csvStream.on('error', () => {
        if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to export tasks' }));
        } else {
            res.destroy();
        }
    });

    csvStream.pipe(res);
}

export async function importTasks({req, res}: TaskService): Promise<void> {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('text/csv')) {
        sendJson(res, 415, { error: 'Content-Type must be text/csv' });
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
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ imported: importedCount }));
        } catch {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to save tasks' }));
        }
    });

    rl.on('error', () => {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid CSV format' }));
    });
}

export function getHealth({res}: TaskService): void {
    sendJson(res, 200, { status: 'ok', uptime: process.uptime() });
}

export function getInfo({res}: TaskService): void {
    sendJson(res, 200, {
        nodeVersion: process.version,
        platform: os.platform(),
        memoryUsage: process.memoryUsage(),
    });
}
