import z from 'zod';

export const createTaskSchema = z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    status: z.enum(['todo', 'in-progress', 'done']).optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = createTaskSchema.partial();

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;