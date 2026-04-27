export function getAllowedMethods(pathname: string) {
    if (pathname === '/tasks') {
        return ['GET', 'POST'];
    }

    if (pathname === '/tasks/import') {
        return ['POST'];
    }

    if (pathname === '/health' || pathname === '/info') {
        return ['GET'];
    }

    const urlParts = pathname.split('/').filter(Boolean);
    if (urlParts[0] === 'tasks' && urlParts.length === 2) {
        return ['GET', 'PUT', 'DELETE'];
    }

    if (urlParts[0] === 'tasks' && urlParts[2] === 'attachments' && urlParts.length === 3) {
        return ['POST'];
    }

    if (urlParts[0] === 'tasks' && urlParts[2] === 'attachments' && urlParts.length === 4) {
        return ['GET'];
    }

    return [];
}
