import http from 'node:http';
import os from 'node:os';
import readline from 'node:readline';
import { createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateId } from './utils/id-generator.js';
import { info, warn, error } from './utils/logger.js';
import { TaskEventBus } from './events/task-event-bus.js';
import { Readable, Writable } from 'node:stream';
import { channel } from 'node:diagnostics_channel';

const PORT = process.env.PORT || 3000;
const eventBus = new TaskEventBus();
const tasks = [];
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');

const AUDIT_FILE = path.join(DATA_DIR, 'audit.log');
await fs.mkdir(DATA_DIR, { recursive: true });
const auditFileStream = createWriteStream(AUDIT_FILE, { 
    flags: 'a', 
    encoding: 'utf8',
});
const audit = new Writable({ 
    objectMode: true, 
    write(event, _encoding, callback) {
        const line = JSON.stringify({
            at: new Date().toISOString(),
            event: event.event,
            payload: event.payload,
        }) + '\n';

        if(!auditFileStream.write(line)) {
            auditFileStream.once('drain', callback);
            return;
        }

        callback();
    }
});

const CSV_COLUMNS = ['id', 'title', 'description', 'status', 'createdAt', 'updatedAt'];


function escapeCsv (value) {
    const str = String(value ?? '');
    if(/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

eventBus.on('task:created', (task) => {
    logTaskEvent('task:created', task);
});
eventBus.on('task:updated', (task) => {
    logTaskEvent('task:updated', task);
});
eventBus.on('task:deleted', (id) => {
    logTaskEvent('task:deleted', id);
});

function logTaskEvent(eventName, payload) {
    audit.write({ event: eventName, payload});
}

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

function parseCsvLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        const next = line[i + 1];

        if (char === '"' && inQuotes && next === '"') {
            current += '"';
            i += 1;
            continue;
        }

        if (char === '"') {
            inQuotes = !inQuotes;
            continue;
        }

        if (char === ',' && !inQuotes) {
            values.push(current);
            current = '';
            continue;
        }

        current += char;
    }

    values.push(current);
    return values.map((value) => value.trim());
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
        eventBus.emit('task:created', task);
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
        eventBus.emit('task:updated', tasks[index]);
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
                eventBus.emit("task:deleted", id);
            })
            .catch(() => {
                sendJson(res, 500, { error: 'Failed to persist tasks' });
            });
    },
    'GET /tasks/export': (_req, res) => {
        const headerLine = CSV_COLUMNS.join(',') + '\n';
        const rowLines = tasks.map((task) => CSV_COLUMNS.map((col) => escapeCsv(task[col])).join(',') + '\n');

        res.writeHead(200, {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="tasks.csv"',  
        })

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
    },
    'POST /tasks/import': async (req, res) => {
        const contentType = req.headers['content-type'] || '';
        if (!contentType.includes('text/csv')) {
        sendJson(res, 415, { error: 'Content-Type must be text/csv' });
        return;
        }

        const rl = readline.createInterface({
            input: req,
            crlfDelay: Infinity
        });
        
        let importedCount = 0;
        let isFirstLine = true;
        let headers = [];
        
        rl.on('line', async (line) => {
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
                updatedAt: new Date().toISOString()
            };
            
            tasks.push(newTask);
            eventBus.emit('task:created', newTask);
            importedCount++;
        });
        
        rl.on('close', async () => {
            try {
                await saveTasks();
                res.writeHead(201, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ imported: importedCount }));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to save tasks' }));
            }
        });
        
        rl.on('error', (error) => {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid CSV format' }));
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
    },
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

    if (pathname === '/tasks/import') {
        return ['POST'];
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
