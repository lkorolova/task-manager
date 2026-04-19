import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DATA_DIR = path.resolve(__dirname, '../../data');
export const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');

export const tasks = [];

export async function loadTasks() {
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

export async function saveTasks() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf8');
}
