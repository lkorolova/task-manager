import { createReadStream, createWriteStream } from 'node:fs';

const src = process.argv[2];
const dest = process.argv[3];

if (!src || !dest) {
    console.error('Usage: node utils/copy-file.js <src> <dest>');
    process.exit(1);
}

const readStream = createReadStream(src);
const writeStream = createWriteStream(dest);

readStream.on('error', (err) => {
    console.error(`Read error: ${err.message}`);
    writeStream.destroy();
    process.exit(1);
});

writeStream.on('error', (err) => {
    console.error(`Write error: ${err.message}`);
    readStream.destroy();
    process.exit(1);
});

writeStream.on('finish', () => {
    console.log(`Copied ${src} -> ${dest}`);
});

readStream.pipe(writeStream);
