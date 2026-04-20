export function generateId(): string {
    const id = crypto.randomUUID();

    return id;
}