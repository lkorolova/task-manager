import type { PaginationParams } from "../types/task.js";

export function parsePagination(query: qs.ParsedQs): PaginationParams {
    const page = Math.max(1, parseInt(query['page'] as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query['limit'] as string) || 20));
    return { page, limit };
}