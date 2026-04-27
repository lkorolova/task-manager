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
    uploadAttachment,
    getAttachment,
} from '../handlers/route-handlers.js';
import { createTaskSchema, updateTaskSchema } from '../validators/task.validator.js';
import { validate } from '../middleware/validate.js';
import { ensureTaskExists, ensureUploadDir, upload } from '../middleware/upload.js';

const router: Router = express.Router();

router.get('/tasks/export', exportTasks);
router.post('/tasks/import', importTasks);
router.get('/tasks', getTasks);
router.post('/tasks', validate(createTaskSchema), createTask);
router.get('/tasks/:id', getTask);
router.put('/tasks/:id', validate(updateTaskSchema), updateTask);
router.delete('/tasks/:id', deleteTask);
router.post(
    '/tasks/:id/attachments',
    ensureTaskExists,
    ensureUploadDir,
    upload.single('file'),
    uploadAttachment
);
router.get('/tasks/:id/attachments/:filename', ensureTaskExists, getAttachment);
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

