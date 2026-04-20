export function info(...args: unknown[]): void {
    const timestamp = new Date().toISOString();
    console.info(timestamp, ...args);
}

export function warn(...args: unknown[]): void {
    const timestamp = new Date().toISOString();
    console.warn(timestamp, ...args);
}

export function error(...args: unknown[]): void {
    const timestamp = new Date().toISOString();
    console.error(timestamp, ...args);
}

