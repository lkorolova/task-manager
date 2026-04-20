import express from 'express';
import type { Router, Request, Response } from 'express';
import { sendJson } from '../utils/http.js';
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

router.get('/tasks/export', (req: Request, res: Response) => exportTasks({ req, res }));
router.post('/tasks/import', (req: Request, res: Response) => importTasks({ req, res }));
router.get('/tasks', (req: Request, res: Response) => getTasks({ req, res }));
router.post('/tasks', (req: Request, res: Response) => createTask({ req, res }));
router.get('/tasks/:id', (req: Request<{ id: string }>, res: Response) => getTask({ req, res, params: { id: req.params.id } }));
router.put('/tasks/:id', (req: Request<{ id: string }>, res: Response) => updateTask({ req, res, params: { id: req.params.id } }));
router.delete('/tasks/:id', (req: Request<{ id: string }>, res: Response) => deleteTask({ req, res, params: { id: req.params.id } }));
router.get('/health', (req: Request, res: Response) => getHealth({ req, res }));
router.get('/info', (req: Request, res: Response) => getInfo({ req, res }));

router.use((req: Request, res: Response) => {
    const allowedMethods = getAllowedMethods(req.path);
    if (allowedMethods.length > 0) {
        res.set('Allow', allowedMethods.join(', '));
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    sendJson(res, 404, { error: 'Not found' });
});

export default router;

