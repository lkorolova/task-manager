export function info() {
    const timestamp = new Date().toISOString();
    console.info(timestamp, ...arguments);
}

export function warn() {
    const timestamp = new Date().toISOString();
    console.warn(timestamp, ...arguments);
}

export function error() {
    const timestamp = new Date().toISOString();
    console.error(timestamp, ...arguments);
}

