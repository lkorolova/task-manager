import type { UserRole } from "./user.ts";

declare global {
    namespace Express { 
        interface Request { 
            id: string,
            user?: { 
                id: string;
                role: UserRole;
            },
            task?: {
                userId: string;
            }
        } 
    }
}