import type { SignOptions } from "jsonwebtoken";

export interface User {
    id: string;
    username: string;
    email: string;
    role: UserRole;
    passwordHash: string;
    createdAt: string;
}

export type UserRole = 'user' | 'admin'

export interface JwtPayload {
    userId: User['id'];
    userRole: UserRole;
}

export interface JwtConfig {
    access: SignOptions;
    refresh: SignOptions;
}