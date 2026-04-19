import path from 'node:path';
import { createWriteStream, promises as fs } from 'node:fs';
import { Writable } from 'node:stream';
import { info, warn, error } from './utils/logger.js';
import { taskEventBus } from './events/task-event-bus.js';
import { server } from './server.js';
import { loadTasks, DATA_DIR } from './services/task.service.js';

const PORT = process.env.PORT || 3000;
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

        if (!auditFileStream.write(line)) {
            auditFileStream.once('drain', callback);
            return;
        }

        callback();
    },
});

taskEventBus.on('task:created', (task) => {
    audit.write({ event: 'task:created', payload: task });
});
taskEventBus.on('task:updated', (task) => {
    audit.write({ event: 'task:updated', payload: task });
});
taskEventBus.on('task:deleted', (id) => {
    audit.write({ event: 'task:deleted', payload: id });
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
