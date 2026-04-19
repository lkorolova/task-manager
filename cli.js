import http from 'node:http';
import { createWriteStream } from 'node:fs';

const command = process.argv[2];

switch (command) {
    case 'list':
        await listTasks();
        break;
    case 'add': {
        const title = process.argv[3];
        if (!title) {
            console.error('Usage: node cli.js add "Task title"');
            process.exit(1);
        }
        await addTask(title);
        break;
    }
    case 'delete': {
        const id = process.argv[3];
        if (!id) {
            console.error('Usage: node cli.js delete <id>');
            process.exit(1);
        }
        await deleteTask(id);
        break;
    }
    case 'export': {
        const filename = process.argv[3];
        if (!filename) {
            console.error('Usage: node cli.js export <filename>');
            process.exit(1);
        }
        await exportTasks(filename);
        break;
    }
    default:
        console.error(`Unknown command: ${command}`);
        console.error('Commands: list, add, delete, export');
        process.exit(1);
}

function listTasks() {
    return new Promise((resolve, reject) => {
        const req = http.request(
            { host: 'localhost', port: 3000, path: '/tasks', method: 'GET' },
            (res) => {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    try {
                        const tasks = JSON.parse(data);
                        tasks.forEach((t) => console.log(t));
                        resolve();
                    } catch (err) {
                        reject(new Error(`Failed to parse response: ${err.message}`));
                    }
                });
            }
        );

        req.on('error', (err) => {
            console.error(`Request failed: ${err}`);
            process.exit(1);
        });

        req.end();
    });
}

function addTask(title) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({ title });
        const options = {
            host: 'localhost',
            port: 3000,
            path: '/tasks',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    const task = JSON.parse(data);
                    if (res.statusCode === 201) {
                        console.log(`Task created: [${task.id}] ${task.title}`);
                        resolve(task);
                    } else {
                        console.error(`Error: Server returned ${res.statusCode}`, task);
                        process.exit(1);
                    }
                } catch (err) {
                    reject(new Error(`Failed to parse response: ${err.message}`));
                }
            });
        });

        req.on('error', (err) => {
            console.error(`Request failed: ${err}`);
            process.exit(1);
        });

        req.write(body);
        req.end();
    });
}

function deleteTask(id) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({ id });
        const options = {
            host: 'localhost',
            port: 3000,
            path: `/tasks/${id}`,
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    if (res.statusCode === 204) {
                        console.log(`Task deleted: [${id}]`);
                        resolve();
                        return;
                    }
                    const parsed = JSON.parse(data);
                    console.error(`Error: Server returned ${res.statusCode}`, parsed);
                    process.exit(1);
                } catch (err) {
                    reject(new Error(`Failed to parse response: ${err.message}`));
                }
            });
        });

        req.on('error', (err) => {
            console.error(`Request failed: ${err}`);
            process.exit(1);
        });

        req.write(body);
        req.end();
    });
}

function exportTasks(filename) {
    return new Promise((resolve, reject) => {
        const options = {
            host: 'localhost',
            port: 3000,
            path: '/tasks/export',
            method: 'GET',
        };

        const req = http.request(options, (res) => {
            if (res.statusCode !== 200) {
                console.error(`Error: Server returned ${res.statusCode}`);
                process.exit(1);
            }

            const fileStream = createWriteStream(filename);

            res.pipe(fileStream);

            fileStream.on('finish', () => {
                console.log(`Exported to ${filename}`);
                resolve();
            });

            fileStream.on('error', (err) => {
                console.error(`Failed to write file: ${err.message}`);
                process.exit(1);
            });
        });

        req.on('error', (err) => {
            console.error(`Request failed: ${err}`);
            process.exit(1);
        });

        req.end();
    });
}