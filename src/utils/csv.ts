import type { Task } from '../types/task.js';

export const CSV_COLUMNS: (keyof Task)[] = ['id', 'title', 'description', 'status', 'createdAt', 'updatedAt'];

export function parseCsvLine(line: string): string[] {
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

export function escapeCsv(value: unknown): string {
    const str = String(value ?? '');
    if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}
