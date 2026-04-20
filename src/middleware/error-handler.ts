import type { Request, Response, NextFunction } from "express";
import { error } from "../utils/logger.js";

export const errorHandler = (err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction): void => {
    const status = err.status ?? 500;
    error("An error occured: ", err.message);
    res.status(status).json({ error: { message: err.message, code: status } });
};