const fs = require('fs').promises;
const path = require('path');
const { env } = require('./env');

const BACKEND_ROOT = path.join(__dirname, '..', '..');
const runtimeOnVercel = env.vercel;
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

    await fs.writeFile(targetPath, '[]');

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
