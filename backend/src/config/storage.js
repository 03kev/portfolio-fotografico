const fs = require('fs').promises;
const path = require('path');

const BACKEND_ROOT = path.join(__dirname, '..', '..');
const SOURCE_DATA_DIR = path.join(BACKEND_ROOT, 'data');
const runtimeOnVercel = Boolean(process.env.VERCEL);
const RUNTIME_ROOT = runtimeOnVercel ? '/tmp/portfolio-fotografico' : BACKEND_ROOT;
const STORAGE_ROOT = path.join(RUNTIME_ROOT, 'storage');
const DATA_DIR = path.join(STORAGE_ROOT, 'data');
const UPLOADS_DIR = path.join(STORAGE_ROOT, 'uploads');
const THUMBNAILS_DIR = path.join(UPLOADS_DIR, 'thumbnails');

async function ensureDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
}

async function ensureDataFile(filename) {
    await ensureDir(DATA_DIR);

    const targetPath = path.join(DATA_DIR, filename);

    try {
        await fs.access(targetPath);
        return targetPath;
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }

    const seedPath = path.join(SOURCE_DATA_DIR, filename);

    try {
        const seedContent = await fs.readFile(seedPath, 'utf8');
        await fs.writeFile(targetPath, seedContent);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.writeFile(targetPath, '[]');
        } else {
            throw error;
        }
    }

    return targetPath;
}

async function ensureUploadsDirectories() {
    await ensureDir(UPLOADS_DIR);
    await ensureDir(THUMBNAILS_DIR);
}

function resolvePublicFilePath(publicPath) {
    const normalizedPath = String(publicPath || '').replace(/^\/+/, '');
    return path.join(STORAGE_ROOT, normalizedPath);
}

module.exports = {
    BACKEND_ROOT,
    DATA_DIR,
    STORAGE_ROOT,
    THUMBNAILS_DIR,
    UPLOADS_DIR,
    ensureDataFile,
    ensureUploadsDirectories,
    resolvePublicFilePath
};
