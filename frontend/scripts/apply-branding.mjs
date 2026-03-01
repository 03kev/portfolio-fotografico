import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const frontendDir = path.resolve(__dirname, '..');
const brandingDir = path.join(frontendDir, 'branding');
const profilesDir = path.join(brandingDir, 'profiles');
const configPath = path.join(brandingDir, 'config.json');
const publicDir = path.join(frontendDir, 'public');
const MASKABLE_SCALE = 0.8;
const MASKABLE_BACKGROUND = '#0B1017';
const RSVG_SUPERSAMPLE = 2;
const HAS_RSVG = hasCommand('rsvg-convert', ['--version']);
const DEFAULT_PRESETS = {
  mixed: {
    web: 'diaframma',
    pwa: 'camera',
    ios: 'camera',
  },
};

const args = process.argv.slice(2);
const parsed = parseArgs(args);

const rawConfig = readJson(configPath);
const presets = { ...DEFAULT_PRESETS, ...(rawConfig.presets || {}) };
const currentChannels = pickChannels(rawConfig);

let nextConfig = { ...currentChannels };

if (parsed.target) {
  if (presets[parsed.target]) {
    nextConfig = { ...nextConfig, ...presets[parsed.target] };
  } else {
    assertProfileExists(parsed.target);
    nextConfig = {
      web: parsed.target,
      pwa: parsed.target,
      ios: parsed.target,
    };
  }
}

nextConfig = { ...nextConfig, ...parsed.overrides };
validateConfig(nextConfig);

if (hasConfigChanges(currentChannels, nextConfig)) {
  const nextRawConfig = {
    ...rawConfig,
    ...nextConfig,
  };
  fs.writeFileSync(configPath, `${JSON.stringify(nextRawConfig, null, 2)}\n`, 'utf8');
}

const webSvg = resolveProfileAsset(nextConfig.web, 'web.svg');
const pwaSvg = resolveProfileAsset(nextConfig.pwa, 'app.svg');
const iosSvg = resolveProfileAsset(nextConfig.ios, 'app.svg');

ensureTooling();

fs.copyFileSync(webSvg, path.join(publicDir, 'favicon.svg'));

runMagick([
  '-background',
  'none',
  webSvg,
  '-define',
  'icon:auto-resize=64,48,32,24,16',
  path.join(publicDir, 'favicon.ico'),
]);

createAppIcon({
  input: pwaSvg,
  output: path.join(publicDir, 'logo192.png'),
  size: 192,
});

createAppIcon({
  input: pwaSvg,
  output: path.join(publicDir, 'logo512.png'),
  size: 512,
});

createMaskableIcon({
  input: pwaSvg,
  output: path.join(publicDir, 'icon-maskable-192.png'),
  size: 192,
});

createMaskableIcon({
  input: pwaSvg,
  output: path.join(publicDir, 'icon-maskable-512.png'),
  size: 512,
});

createAppIcon({
  input: iosSvg,
  output: path.join(publicDir, 'apple-touch-icon.png'),
  size: 180,
});

console.log('Branding applied');
console.log(`  web favicon: ${nextConfig.web}`);
console.log(`  pwa icons:   ${nextConfig.pwa}`);
console.log(`  ios icon:    ${nextConfig.ios}`);

function parseArgs(argv) {
  const out = {
    target: null,
    overrides: {},
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (!arg.startsWith('--')) {
      if (out.target) {
        throw new Error(`Only one target is allowed. Received: ${arg}`);
      }
      out.target = arg;
      continue;
    }

    if (arg === '--web') {
      out.overrides.web = argv[++i];
      continue;
    }

    if (arg === '--pwa') {
      out.overrides.pwa = argv[++i];
      continue;
    }

    if (arg === '--ios') {
      out.overrides.ios = argv[++i];
      continue;
    }

    if (arg === '--preset') {
      const presetName = argv[++i];
      if (!presetName) {
        throw new Error('Missing value for --preset');
      }
      if (out.target) {
        throw new Error('Cannot use --preset together with a positional target');
      }
      out.target = presetName;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return out;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function pickChannels(config) {
  return {
    web: config.web,
    pwa: config.pwa,
    ios: config.ios,
  };
}

function validateConfig(current) {
  const channels = ['web', 'pwa', 'ios'];

  for (const channel of channels) {
    const profile = current[channel];
    if (!profile || typeof profile !== 'string') {
      throw new Error(`Invalid profile for channel \"${channel}\"`);
    }

    assertProfileExists(profile);
  }
}

function resolveProfileAsset(profile, fileName) {
  const filePath = path.join(profilesDir, profile, fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing asset: ${filePath}`);
  }
  return filePath;
}

function assertProfileExists(profile) {
  const profileDir = path.join(profilesDir, profile);
  if (!fs.existsSync(profileDir)) {
    throw new Error(`Profile not found: ${profile}`);
  }
}

function hasConfigChanges(current, next) {
  return current.web !== next.web || current.pwa !== next.pwa || current.ios !== next.ios;
}

function ensureTooling() {
  try {
    execFileSync('magick', ['-version'], { stdio: 'ignore' });
  } catch {
    throw new Error('ImageMagick (magick) not found in PATH');
  }
}

function hasCommand(command, args = []) {
  try {
    execFileSync(command, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function runMagick(cmdArgs) {
  execFileSync('magick', cmdArgs, { stdio: 'inherit' });
}

function createAppIcon({ input, output, size }) {
  if (HAS_RSVG) {
    const tempHighRes = createTempPath('rsvg-hi');
    const pngBytes = execFileSync('rsvg-convert', [
      '--width',
      `${size * RSVG_SUPERSAMPLE}`,
      '--height',
      `${size * RSVG_SUPERSAMPLE}`,
      input,
    ]);
    fs.writeFileSync(tempHighRes, pngBytes);

    runMagick([
      '-background',
      'none',
      tempHighRes,
      '-filter',
      'Lanczos',
      '-resize',
      `${size}x${size}`,
      output,
    ]);

    fs.rmSync(tempHighRes, { force: true });
    return;
  }

  runMagick([
    '-background',
    'none',
    input,
    '-resize',
    `${size}x${size}`,
    output,
  ]);
}

function createMaskableIcon({ input, output, size }) {
  const iconSize = Math.round(size * MASKABLE_SCALE);

  if (HAS_RSVG) {
    const tempHighRes = createTempPath('rsvg-hi-mask');
    const tempIcon = createTempPath('rsvg-mask-icon');

    const pngBytes = execFileSync('rsvg-convert', [
      '--width',
      `${iconSize * RSVG_SUPERSAMPLE}`,
      '--height',
      `${iconSize * RSVG_SUPERSAMPLE}`,
      input,
    ]);
    fs.writeFileSync(tempHighRes, pngBytes);

    runMagick([
      '-background',
      'none',
      tempHighRes,
      '-filter',
      'Lanczos',
      '-resize',
      `${iconSize}x${iconSize}`,
      tempIcon,
    ]);

    runMagick([
      '-background',
      MASKABLE_BACKGROUND,
      tempIcon,
      '-gravity',
      'center',
      '-extent',
      `${size}x${size}`,
      output,
    ]);

    fs.rmSync(tempHighRes, { force: true });
    fs.rmSync(tempIcon, { force: true });
    return;
  }

  runMagick([
    '-background',
    'none',
    input,
    '-resize',
    `${iconSize}x${iconSize}`,
    '-background',
    MASKABLE_BACKGROUND,
    '-gravity',
    'center',
    '-extent',
    `${size}x${size}`,
    output,
  ]);
}

function createTempPath(prefix) {
  return path.join(
    os.tmpdir(),
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.png`,
  );
}
