import type { ZodType } from 'zod';
import type { Request, Response, NextFunction } from 'express';

type ValidationError = {
    field: string;
    message: string;
};

type ParsedIssue = {
    path: PropertyKey[];
    message: string;
};

export function validate<T>(schema: ZodType<T>) {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.body);

        if (result.success) {
            req.body = result.data;
            return next();
        }

        const errors = formatZodError(result.error.issues);
        res.status(422).json({ errors });
    };
}

function formatZodError(issues: ParsedIssue[]): ValidationError[] {  
    return issues.map((issue) => ({
        field: issue.path.join('.') || 'root',
        message: issue.message,
    }));
}
