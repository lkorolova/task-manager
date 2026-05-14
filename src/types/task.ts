type TaskStatus = 'todo' | 'in-progress' | 'done';

export interface Task {
    id: string;
    title: string;
    description: string;
    status: TaskStatus;
    userId: string;
    createdAt: string;
    updatedAt: string;
};

export interface PaginationParams {
    page: number;
    limit: number;
}
