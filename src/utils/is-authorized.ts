import type { User, UserRole } from "../types/user.js"

export const isAuthorized = (role: UserRole, userId: User['id'], taskUserId: User['id']): boolean => {
    if(role === 'admin') return true;

    if(userId === taskUserId) return true;

    return false;
}