import * as THREE from 'three';

export const WORLD_MAP_TEXTURE_SETS = Object.freeze([
    Object.freeze({
        key: '2048',
        width: 2048,
        height: 1024,
        earth: '/textures/earth-2048.jpg',
        boundary: '/textures/boundaries-2048.png'
    }),
    Object.freeze({
        key: '4096',
        width: 4096,
        height: 2048,
        earth: '/textures/earth-4096.jpg',
        boundary: '/textures/boundaries-4096.png'
    })
]);

const DEFAULT_TEXTURE_SET = WORLD_MAP_TEXTURE_SETS[WORLD_MAP_TEXTURE_SETS.length - 1];
const MAX_ACCEPTABLE_TEXEL_UPSCALE = 1.25;

export const configureBoundaryMaskTexture = (texture, isWebGL2) => {
    texture.format = isWebGL2 ? THREE.RedFormat : THREE.LuminanceFormat;
    texture.colorSpace = THREE.NoColorSpace;
    return texture;
};

/**
 * Chooses the smallest texture whose equatorial texel density remains close
 * to the projected density at the centre of the visible globe.
 */
export const selectWorldMapTextureSet = ({
    canvasHeight,
    pixelRatio,
    verticalFov,
    globeRadius,
    cameraDistance,
    maxTextureSize = Infinity
}) => {
    const physicalHeight = Math.max(1, canvasHeight * pixelRatio);
    const halfFovRadians = THREE.MathUtils.degToRad(verticalFov) / 2;
    const distanceFromSurface = Math.max(cameraDistance - globeRadius, 0.001);
    const pixelsPerRadian = (
        physicalHeight
        / (2 * Math.tan(halfFovRadians))
        * (globeRadius / distanceFromSurface)
    );
    const requiredWidth = (
        2
        * Math.PI
        * pixelsPerRadian
        / MAX_ACCEPTABLE_TEXEL_UPSCALE
    );
    const supportedSets = WORLD_MAP_TEXTURE_SETS.filter(
        (textureSet) => textureSet.width <= maxTextureSize
    );
    const candidates = supportedSets.length > 0
        ? supportedSets
        : [WORLD_MAP_TEXTURE_SETS[0]];

    return candidates.find((textureSet) => textureSet.width >= requiredWidth)
        ?? candidates[candidates.length - 1];
};

const disposeMaterial = (material) => {
    if (!material) return;
    const textures = new Set([
        material.map,
        material.normalMap,
        material.specularMap
    ]);
    Object.values(material.uniforms ?? {}).forEach((uniform) => {
        if (uniform?.value?.isTexture) textures.add(uniform.value);
    });
    textures.forEach((texture) => texture?.dispose());
    material.dispose();
};

const disposeBundle = (rotationGroup, bundle) => {
    if (!bundle) return;

    [bundle.earth, bundle.boundary].filter(Boolean).forEach((mesh) => {
        rotationGroup.remove(mesh);
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
            mesh.material.forEach(disposeMaterial);
        } else {
            disposeMaterial(mesh.material);
        }
    });
};

/**
 * Owns the replaceable earth/boundary resources for one WorldMap instance.
 *
 * WebGL context restoration deliberately keeps the same Three.js objects:
 * WebGLRenderer rebuilds their GPU-side state for the new context. Reloading
 * the source textures here would only create duplicate scene objects.
 */
export const createWorldMapGlobeResources = ({
    rotationGroup,
    loadTexture,
    globeRadius,
    segments = 64,
    onStateChange = () => {},
    onFallback = () => {}
}) => {
    let disposed = false;
    let contextAvailable = true;
    let generation = 0;
    let bundle = null;
    let pendingLoad = null;

    const snapshot = () => {
        const hasResources = bundle !== null;
        const interactive = !disposed && contextAvailable && hasResources;
        return {
            status: disposed
                ? 'disposed'
                : !contextAvailable
                    ? 'context-lost'
                    : hasResources
                        ? 'ready'
                        : 'loading',
            earth: bundle?.earth ?? null,
            boundary: bundle?.boundary ?? null,
            fallback: bundle?.fallback ?? false,
            textureSet: bundle?.textureSet ?? null,
            interactive
        };
    };

    const notify = () => onStateChange(snapshot());
    const isStale = (loadGeneration) => (
        disposed || loadGeneration !== generation
    );

    const replaceBundle = (nextBundle, loadGeneration) => {
        if (isStale(loadGeneration)) {
            disposeBundle(rotationGroup, nextBundle);
            return false;
        }

        const previousBundle = bundle;
        bundle = nextBundle;
        rotationGroup.add(nextBundle.earth);
        if (nextBundle.boundary) rotationGroup.add(nextBundle.boundary);
        disposeBundle(rotationGroup, previousBundle);
        notify();
        return true;
    };

    const createTexturedBundle = (earthTexture, boundaryTexture, textureSet) => {
        const earth = new THREE.Mesh(
            new THREE.SphereGeometry(globeRadius, segments, segments),
            new THREE.MeshLambertMaterial({
                map: earthTexture,
                transparent: false
            })
        );
        const boundary = new THREE.Mesh(
            new THREE.SphereGeometry(globeRadius + 0.005, segments, segments),
            new THREE.ShaderMaterial({
                uniforms: {
                    boundaryMask: { value: boundaryTexture },
                    boundaryOpacity: { value: 0.5 }
                },
                vertexShader: `
                    varying vec2 vBoundaryUv;
                    void main() {
                        vBoundaryUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform sampler2D boundaryMask;
                    uniform float boundaryOpacity;
                    varying vec2 vBoundaryUv;
                    void main() {
                        float mask = texture2D(boundaryMask, vBoundaryUv).r;
                        gl_FragColor = vec4(0.0, 0.0, 0.0, mask * boundaryOpacity);
                    }
                `,
                transparent: true,
                depthTest: true,
                polygonOffset: true,
                polygonOffsetFactor: -1,
                polygonOffsetUnits: 1
            })
        );
        return { earth, boundary, fallback: false, textureSet };
    };

    const createFallbackBundle = (textureSet) => ({
        earth: new THREE.Mesh(
            new THREE.SphereGeometry(globeRadius, segments, segments),
            new THREE.MeshLambertMaterial({
                color: 0x6B93D6,
                transparent: false
            })
        ),
        boundary: null,
        fallback: true,
        textureSet
    });

    const load = (textureSet = DEFAULT_TEXTURE_SET) => {
        if (disposed) return Promise.resolve(null);
        if (bundle?.textureSet.key === textureSet.key) {
            if (pendingLoad) {
                generation += 1;
                pendingLoad = null;
            }
            return Promise.resolve(bundle);
        }
        if (pendingLoad?.key === textureSet.key) return pendingLoad.promise;

        const loadGeneration = ++generation;
        if (!bundle) notify();

        const promise = (async () => {
            let earthTexture = null;
            let boundaryTexture = null;

            try {
                earthTexture = await loadTexture(textureSet.earth, 'earth');
                if (isStale(loadGeneration)) {
                    earthTexture.dispose();
                    return null;
                }

                boundaryTexture = await loadTexture(textureSet.boundary, 'boundary');
                if (isStale(loadGeneration)) {
                    earthTexture.dispose();
                    boundaryTexture.dispose();
                    return null;
                }

                const nextBundle = createTexturedBundle(
                    earthTexture,
                    boundaryTexture,
                    textureSet
                );
                return replaceBundle(nextBundle, loadGeneration) ? nextBundle : null;
            } catch (error) {
                earthTexture?.dispose();
                boundaryTexture?.dispose();
                if (isStale(loadGeneration)) return null;

                if (bundle) {
                    onFallback(error, { retainedExisting: true, textureSet });
                    return bundle;
                }

                onFallback(error, { retainedExisting: false, textureSet });
                const fallbackBundle = createFallbackBundle(textureSet);
                return replaceBundle(fallbackBundle, loadGeneration)
                    ? fallbackBundle
                    : null;
            }
        })();

        pendingLoad = { key: textureSet.key, promise };
        promise.finally(() => {
            if (pendingLoad?.promise === promise) pendingLoad = null;
        });
        return promise;
    };

    return {
        load,
        getSnapshot: snapshot,
        getEarth: () => bundle?.earth ?? null,
        isInteractive: () => !disposed && contextAvailable && bundle !== null,
        markContextLost() {
            if (disposed || !contextAvailable) return;
            contextAvailable = false;
            notify();
        },
        markContextRestored() {
            if (disposed || contextAvailable) return;
            contextAvailable = true;
            notify();
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            generation += 1;
            pendingLoad = null;
            const currentBundle = bundle;
            bundle = null;
            disposeBundle(rotationGroup, currentBundle);
            notify();
        }
    };
};
