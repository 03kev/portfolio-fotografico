# Branding Profiles

This folder stores source icon sets and the active channel mapping.

## Profiles

- `profiles/camera/`
- `profiles/diaframma/`

Each profile contains:

- `web.svg`: source for `public/favicon.svg`, `public/favicon.ico`, and `public/favicon-96.png`
- `app.svg`: source for PWA and iOS icons

## Config

`config.json` controls which profile is active per channel:

- `web`: browser favicon
- `pwa`: Android PWA icons (`logo192`, `logo512`, `icon-maskable-*`)
- `ios`: iOS home icon (`apple-touch-icon.png`)
- `presets`: optional named channel mappings (e.g. `mixed`)

## Commands (run from repo root)

- `npm run branding`

Use a single profile for all channels:

```bash
npm run branding -- camera
npm run branding -- diaframma
```

Use a preset (from `config.json` presets):

```bash
npm run branding -- mixed
```

Custom mix with explicit channels:

```bash
npm run branding -- --web camera --pwa diaframma --ios diaframma
```
