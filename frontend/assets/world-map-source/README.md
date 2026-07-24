# World map texture sources

The 8192×4096 files in this directory are source assets and are deliberately
kept outside `public/`, so production builds only contain the runtime variants.

Generate the variants from the frontend directory with ImageMagick:

```sh
magick assets/world-map-source/earth-8192.jpg -filter Lanczos -resize 4096x2048 -sampling-factor 1x1 -interlace Plane -quality 95 public/textures/earth-4096.jpg
magick assets/world-map-source/earth-8192.jpg -filter Lanczos -resize 2048x1024 -sampling-factor 1x1 -interlace Plane -quality 95 public/textures/earth-2048.jpg
magick assets/world-map-source/boundaries-8192.png -alpha extract -filter Lanczos -resize 4096x2048 -define png:compression-level=9 public/textures/boundaries-4096.png
magick assets/world-map-source/boundaries-8192.png -alpha extract -filter Lanczos -resize 2048x1024 -define png:compression-level=9 public/textures/boundaries-2048.png
```

The boundary variants contain only the source alpha channel. Runtime uploads
them as a one-channel WebGL texture instead of allocating an unused RGBA map.
