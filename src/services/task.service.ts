import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Task } from '../types/task.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DATA_DIR = path.resolve(__dirname, '../../data');
export const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');

export const tasks: Task[] = [];

function isTask(value: unknown): value is Task {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as Task).id === 'string' &&
        typeof (value as Task).title === 'string' &&
        typeof (value as Task).description === 'string' &&
        typeof (value as Task).status === 'string' &&
        typeof (value as Task).createdAt === 'string' &&
        typeof (value as Task).updatedAt === 'string'
    );
}

export async function loadTasks(): Promise<void> {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        const data = await fs.readFile(TASKS_FILE, 'utf8');
        const parsed = JSON.parse(data);

        tasks.length = 0;
        if (Array.isArray(parsed)) {
            const validTasks = parsed.filter(isTask);
            tasks.push(...validTasks);
        }
    } catch (error) {
        if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
            await fs.writeFile(TASKS_FILE, '[]', 'utf8');
            return;
        }
        throw error;
    }
}

export async function saveTasks(): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf8');
}
