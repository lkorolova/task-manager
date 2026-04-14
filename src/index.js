import http from 'node:http';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateId } from './utils/id-generator.js';
import { info, warn, error } from './utils/logger.js';

const PORT = process.env.PORT || 3000;
const tasks = [];
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');

function sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
}

function parseJsonBody(req, res) {
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

async function loadTasks() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        const data = await fs.readFile(TASKS_FILE, 'utf8');
        const parsed = JSON.parse(data);

        tasks.length = 0;
        if (Array.isArray(parsed)) {
            tasks.push(...parsed);
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.writeFile(TASKS_FILE, '[]', 'utf8');
            return;
        }
        throw error;
    }
}

async function saveTasks() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf8');
}

const router = {
    'GET /tasks': (_req, res) => {
        sendJson(res, 200, tasks);
    },
    'POST /tasks': async (req, res) => {
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
            updatedAt: new Date().toISOString()
        };

        tasks.push(task);
        await saveTasks();
        sendJson(res, 201, task);
    },
    'GET /tasks/:id': (req, res, {id}) => {
        const task = tasks.find( task => task.id === id);

        if(task) {
            sendJson(res, 200, task);
        } else {
            sendJson(res, 404, { error: 'Task not found' });
        }
    },
    'PUT /tasks/:id': async (req, res, { id }) => {
        const index = tasks.findIndex(task => task.id === id);

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
            updatedAt: new Date().toISOString()
        };

        await saveTasks();
        sendJson(res, 200, tasks[index]);
    },
    'DELETE /tasks/:id': (_req, res, {id}) => {
        const index = tasks.findIndex(task => task.id === id);

        if (index === -1) {
            sendJson(res, 404, { error: 'Task not found' });
            return;
        }

        tasks.splice(index, 1);
        saveTasks()
            .then(() => {
                res.writeHead(204, { 'Content-Type': 'application/json' });
                res.end();
            })
            .catch(() => {
                sendJson(res, 500, { error: 'Failed to persist tasks' });
            });
    },
    'GET /health': (_req, res) => {
        sendJson(res, 200, { status: 'ok', uptime: process.uptime() });
    },
    'GET /info': (_req, res) => {
        sendJson(res, 200, {
            nodeVersion: process.version,
            platform: os.platform(),
            memoryUsage: process.memoryUsage()
        });
    }
}


function matchRoute(method, pathname) {
    const exactKey = `${method} ${pathname}`;

    if (router[exactKey]) {
        return { handler: router[exactKey], params: {} };
    }

    const urlParts = pathname.split('/').filter(Boolean);

    if (urlParts[0] === 'tasks' && urlParts.length === 2) {
        const handler = router[`${method} /tasks/:id`];

        if (handler) {
            return { handler, params: { id: urlParts[1] } };
        }
    }

    return null;
}

function getAllowedMethods(pathname) {
    if (pathname === '/tasks') {
        return ['GET', 'POST'];
    }

    if (pathname === '/health' || pathname === '/info') {
        return ['GET'];
    }

    const urlParts = pathname.split('/').filter(Boolean);
    if (urlParts[0] === 'tasks' && urlParts.length === 2) {
        return ['GET', 'PUT', 'DELETE'];
    }

    return [];
}

const server = http.createServer((request, response) => {
    const method = request.method || 'GET';
    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    
    const match = matchRoute(method, pathname);

    if (match) {
        match.handler(request, response, match.params);
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

loadTasks()
    .then(() => {
        server.listen(PORT, () => {
            info(`Server is running on port ${PORT}`);
            if (!process.env.PORT) {
                warn('PORT is not set, falling back to default port 3000');
            }
        });
    })
    .catch((err) => {
        error('Failed to load tasks', err);
        process.exit(1);
    });
