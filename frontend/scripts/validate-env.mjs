import fs from 'fs';
import path from 'path';

const root = process.cwd();
const nodeEnv = process.env.NODE_ENV || 'development';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!match) continue;

    const key = match[1];
    let value = match[2] ?? '';

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const dotenvFiles = [
  `.env.${nodeEnv}.local`,
  nodeEnv !== 'test' ? '.env.local' : null,
  `.env.${nodeEnv}`,
  '.env'
].filter(Boolean);

dotenvFiles.forEach((file) => loadEnvFile(path.join(root, file)));

const requiredNonEmpty = [
  'REACT_APP_SITE_URL',
  'REACT_APP_API_BASE_URL'
];

const requiredDefined = [
  'REACT_APP_IMAGES_BASE_URL'
];

const errors = [];

for (const key of requiredNonEmpty) {
  if (process.env[key] === undefined || String(process.env[key]).trim() === '') {
    errors.push(`${key} must be defined and non-empty`);
  }
}

for (const key of requiredDefined) {
  if (process.env[key] === undefined) {
    errors.push(`${key} must be defined (empty string is allowed)`);
  }
}

if (errors.length) {
  console.error('[env] Frontend env validation failed:');
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('[env] Frontend env validation passed');
