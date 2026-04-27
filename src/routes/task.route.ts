import express from 'express';
import type { Router, Request, Response } from 'express';
import { getAllowedMethods } from '../router.js';
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
} from '../handlers/route-handlers.js';

const router: Router = express.Router();

router.get('/tasks/export', exportTasks);
router.post('/tasks/import', importTasks);
router.get('/tasks', getTasks);
router.post('/tasks', createTask);
router.get('/tasks/:id', getTask);
router.put('/tasks/:id', updateTask);
router.delete('/tasks/:id', deleteTask);
router.get('/health', getHealth);
router.get('/info', getInfo);

router.use((req: Request, res: Response) => {
    const allowedMethods = getAllowedMethods(req.path);
    if (allowedMethods.length > 0) {
        res.set('Allow', allowedMethods.join(', '));
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    res.status(404).json({ error: 'Not found' });
});

export default router;

