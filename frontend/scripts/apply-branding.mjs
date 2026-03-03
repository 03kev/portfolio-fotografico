/**
 * Script branding frontend.
 * Applica un profilo icone per canale (web/pwa/ios), aggiorna branding/config.json
 * e rigenera gli asset in /public (favicon, logo app, maskable, apple-touch-icon).
 *
 * Uso:
 *   npm run branding -- <profilo|preset> [--web <profilo>] [--pwa <profilo>] [--ios <profilo>]
 */
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
const DEFAULT_MASKABLE_BACKGROUND = '#0B1017';
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
const maskableBackground = detectMaskableBackground(pwaSvg);

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
  background: maskableBackground,
});

createMaskableIcon({
  input: pwaSvg,
  output: path.join(publicDir, 'icon-maskable-512.png'),
  size: 512,
  background: maskableBackground,
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
console.log(`  maskable bg: ${maskableBackground}`);

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

function createMaskableIcon({ input, output, size, background }) {
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
      background,
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
    background,
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

function detectMaskableBackground(input) {
  const firstFill = readFirstSolidFill(input);
  if (firstFill) return firstFill;

  const tempSample = createTempPath('mask-bg-sample');
  const sampleSize = 256;
  const samplePoints = [
    [128, 4],
    [4, 128],
    [252, 128],
    [128, 252],
    [64, 8],
    [192, 8],
    [8, 64],
    [8, 192],
    [248, 64],
    [248, 192],
    [64, 248],
    [192, 248],
  ];

  try {
    renderSvgToPng(input, tempSample, sampleSize);

    const format = samplePoints
      .map(([x, y]) => `%[pixel:p{${x},${y}}]`)
      .join('|');
    const raw = execFileSync('magick', [tempSample, '-format', format, 'info:'], {
      encoding: 'utf8',
    }).trim();

    const tokens = raw.split('|').map((t) => t.trim()).filter(Boolean);
    const counts = new Map();

    for (const token of tokens) {
      const parsed = parseColorToken(token);
      if (!parsed || parsed.a < 0.95) continue;
      const hex = rgbToHex(parsed.r, parsed.g, parsed.b);
      counts.set(hex, (counts.get(hex) || 0) + 1);
    }

    if (counts.size > 0) {
      return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }
  } catch {
    // Fallbacks below.
  } finally {
    fs.rmSync(tempSample, { force: true });
  }

  return DEFAULT_MASKABLE_BACKGROUND;
}

function renderSvgToPng(input, output, size) {
  if (HAS_RSVG) {
    const pngBytes = execFileSync('rsvg-convert', [
      '--width',
      `${size}`,
      '--height',
      `${size}`,
      input,
    ]);
    fs.writeFileSync(output, pngBytes);
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

function readFirstSolidFill(svgPath) {
  const content = fs.readFileSync(svgPath, 'utf8');
  const fillMatches = [...content.matchAll(/fill="([^"]+)"/g)];

  for (const [, value] of fillMatches) {
    if (!value) continue;
    const lower = value.toLowerCase();
    if (lower === 'none') continue;
    if (lower.startsWith('url(')) continue;
    if (lower === 'currentcolor') continue;

    const parsed = parseColorToken(value);
    if (!parsed || parsed.a <= 0) continue;
    return rgbToHex(parsed.r, parsed.g, parsed.b);
  }

  return null;
}

function parseColorToken(token) {
  if (!token) return null;
  const value = token.trim().toLowerCase();

  if (value.startsWith('#')) {
    return parseHexColor(value);
  }

  const rgbaMatch = value.match(/^(?:s?rgba?)\(([^)]+)\)$/);
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(',').map((p) => p.trim());
    if (parts.length < 3) return null;

    const r = parseChannel(parts[0]);
    const g = parseChannel(parts[1]);
    const b = parseChannel(parts[2]);
    const a = parts[3] !== undefined ? parseAlpha(parts[3]) : 1;
    if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
    return { r, g, b, a };
  }

  return null;
}

function parseHexColor(hex) {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return { r, g, b, a: 1 };
  }
  if (clean.length === 4) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    const a = parseInt(clean[3] + clean[3], 16) / 255;
    return { r, g, b, a };
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return { r, g, b, a: 1 };
  }
  if (clean.length === 8) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    const a = parseInt(clean.slice(6, 8), 16) / 255;
    return { r, g, b, a };
  }
  return null;
}

function parseChannel(input) {
  if (input.endsWith('%')) {
    const pct = parseFloat(input.slice(0, -1));
    return clampByte((pct / 100) * 255);
  }
  return clampByte(parseFloat(input));
}

function parseAlpha(input) {
  if (input.endsWith('%')) {
    return clampUnit(parseFloat(input.slice(0, -1)) / 100);
  }
  const numeric = parseFloat(input);
  if (numeric > 1) return clampUnit(numeric / 255);
  return clampUnit(numeric);
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clampUnit(value) {
  return Math.max(0, Math.min(1, value));
}

function rgbToHex(r, g, b) {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function toHex(value) {
  return value.toString(16).padStart(2, '0').toUpperCase();
}
