export function readCookie(cookieHeader: string | undefined, cookieName: string): string | null {
    if (!cookieHeader) return null;
    const part = cookieHeader
        .split(';')
        .map((v) => v.trim())
        .find((v) => v.startsWith(`${cookieName}=`));
    if (!part) return null;
    return decodeURIComponent(part.slice(cookieName.length + 1));
}