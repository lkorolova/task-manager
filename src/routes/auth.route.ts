import express from 'express';
import type { Router } from 'express';
import { createUser, login, logout, refresh } from '../handlers/route-handlers.js';
import { validate } from '../middleware/validate.js';
import { createUserSchema } from '../validators/auth.validator.js';

const authRouter: Router = express.Router();

authRouter.post('/auth/register', validate(createUserSchema), createUser);
authRouter.post('/auth/login', login);
authRouter.post('/auth/refresh', refresh);
authRouter.post('/auth/logout', logout);

export default authRouter;