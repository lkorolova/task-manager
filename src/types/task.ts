import type { IncomingMessage, ServerResponse } from "node:http";

type TaskStatus = 'todo' | 'in-progress' | 'done';

export interface Task {
    id: string; 
    title: string; 
    description: string; 
    status: TaskStatus; 
    createdAt: string; 
    updatedAt: string;
};

export type TaskService = {
    req: IncomingMessage, 
    res: ServerResponse, 
    params?: TaskServiceParams,
}

export type TaskServiceParams = {
    id?: string,
}
