import {
    getTasks,
    createTask,
    getTask,
    updateTask,
    deleteTask,
    exportTasks,
    importTasks,
    getHealth,
    getInfo,
} from './handlers/route-handlers.js';
import type { RouteHandler, HttpMethod } from './types/task.js';

export const router: Record<string, RouteHandler> = {
    'GET /tasks': getTasks,
    'POST /tasks': createTask,
    'GET /tasks/:id': getTask,
    'PUT /tasks/:id': updateTask,
    'DELETE /tasks/:id': deleteTask,
    'GET /tasks/export': exportTasks,
    'POST /tasks/import': importTasks,
    'GET /health': getHealth,
    'GET /info': getInfo,
};

export function matchRoute(method: HttpMethod, pathname: string) {
    const exactKey = `${method} ${pathname}`;

    if (router[exactKey]) {
        return { handler: router[exactKey], params: {} };
    }

    const urlParts = pathname.split('/').filter(Boolean);

    if (urlParts[0] === 'tasks' && urlParts.length === 2) {
        const handler = router[`${method} /tasks/:id`];

        if (handler) {
            return { handler, params: { id: urlParts[1]! } };
        }
    }

    return null;
}

export function getAllowedMethods(pathname: string) {
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
