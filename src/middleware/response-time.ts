import type { Request, Response, NextFunction } from "express";
import { info } from "../utils/logger.js";

const responseTime = (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now();

    res.on('finish', () => {
        const ms = Date.now() - start;
        info(`${req.method} ${req.path} - ${ms}ms`)
    });

    next();
}

export default responseTime;