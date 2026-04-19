import os from 'node:os';
import readline from 'node:readline';
import { Readable } from 'node:stream';
import { generateId } from '../utils/id-generator.js';
import { sendJson, parseJsonBody } from '../utils/http.js';
import { taskEventBus } from '../events/task-event-bus.js';
import { tasks, saveTasks } from '../services/task.service.js';
import { parseCsvLine, escapeCsv, CSV_COLUMNS } from '../utils/csv.js';

export function getTasks(_req, res) {
    sendJson(res, 200, tasks);
}

export async function createTask(req, res) {
    const taskData = await parseJsonBody(req, res);
    if (!taskData) {
        return;
    }

    const task = {
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
    taskEventBus.emit('task:created', task);
}

export function getTask(_req, res, { id }) {
    const task = tasks.find((task) => task.id === id);

    if (task) {
        sendJson(res, 200, task);
    } else {
        sendJson(res, 404, { error: 'Task not found' });
    }
}

export async function updateTask(req, res, { id }) {
    const index = tasks.findIndex((task) => task.id === id);

    if (index === -1) {
        sendJson(res, 404, { error: 'Task not found' });
        return;
    }

    const updates = await parseJsonBody(req, res);
    if (!updates) {
        return;
    }

    tasks[index] = {
        ...tasks[index],
        ...updates,
        id: tasks[index].id,
        updatedAt: new Date().toISOString(),
    };

    await saveTasks();
    sendJson(res, 200, tasks[index]);
    taskEventBus.emit('task:updated', tasks[index]);
}

export function deleteTask(_req, res, { id }) {
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
            taskEventBus.emit('task:deleted', id);
        })
        .catch(() => {
            sendJson(res, 500, { error: 'Failed to persist tasks' });
        });
}

export function exportTasks(_req, res) {
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

export async function importTasks(req, res) {
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
    let headers = [];

    rl.on('line', (line) => {
        if (isFirstLine) {
            headers = parseCsvLine(line);
            isFirstLine = false;
            return;
        }

        if (!line.trim()) return;

        const fields = parseCsvLine(line);
        const taskData = {};

        headers.forEach((header, index) => {
            taskData[header] = fields[index] || '';
        });

        const newTask = {
            id: taskData.id || generateId(),
            title: taskData.title || '',
            description: taskData.description || '',
            status: taskData.status || 'pending',
            createdAt: taskData.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        tasks.push(newTask);
        taskEventBus.emit('task:created', newTask);
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

export function getHealth(_req, res) {
    sendJson(res, 200, { status: 'ok', uptime: process.uptime() });
}

export function getInfo(_req, res) {
    sendJson(res, 200, {
        nodeVersion: process.version,
        platform: os.platform(),
        memoryUsage: process.memoryUsage(),
    });
}
