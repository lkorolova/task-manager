import type { Request, Response, NextFunction } from "express";
import { generateId } from "../utils/id-generator.js";

export const requestId = (req: Request, res: Response, next: NextFunction ): void => {
    req.id = generateId();
    res.set('X-Request-Id', req.id);
    next();
};