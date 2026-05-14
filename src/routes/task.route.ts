import express from 'express';
import type { Router } from 'express';
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
    getUserTasks,
    getTaskComments,
    createComment,
} from '../handlers/route-handlers.js';
import { createTaskSchema, updateTaskSchema } from '../validators/task.validator.js';
import { validate } from '../middleware/validate.js';
import { ensureTaskExists, ensureUploadDir, upload } from '../middleware/upload.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

const taskRouter: Router = express.Router();

taskRouter.use(['/tasks', '/users'], authenticate);

taskRouter.get('/tasks/export', authorize('admin'), exportTasks);
taskRouter.post('/tasks/import', authorize('admin'), importTasks);
taskRouter.get('/health', getHealth);
taskRouter.get('/info', getInfo);

taskRouter.get('/tasks', authorize('admin'), getTasks);
taskRouter.post('/tasks', authorize('admin', 'user'), validate(createTaskSchema), createTask);
taskRouter.get('/tasks/:id', authorize('admin', 'user'), getTask);
taskRouter.put('/tasks/:id', authorize('admin', 'user'), validate(updateTaskSchema), ensureTaskExists, updateTask);
taskRouter.delete('/tasks/:id', authorize('admin', 'user'), ensureTaskExists, deleteTask);
taskRouter.post(
    '/tasks/:id/attachments',
    authorize('admin', 'user'),
    ensureTaskExists,
    ensureUploadDir,
    upload.single('file'),
    uploadAttachment
);
taskRouter.get('/tasks/:id/attachments/:filename',  authorize('admin', 'user'), ensureTaskExists, getAttachment);
taskRouter.get('/users/:id/tasks', authorize('admin', 'user'), getUserTasks);
taskRouter.get('/tasks/:id/comments', authorize('admin', 'user'), ensureTaskExists, getTaskComments);
taskRouter.post('/tasks/:id/comments', authorize('admin', 'user'), ensureTaskExists, createComment);

export default taskRouter;

