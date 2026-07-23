import * as THREE from 'three';

const disposeMaterial = (material) => {
    if (!material) return;
    material.map?.dispose();
    material.normalMap?.dispose();
    material.specularMap?.dispose();
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

    const createTexturedBundle = (earthTexture, boundaryTexture) => {
        const earth = new THREE.Mesh(
            new THREE.SphereGeometry(globeRadius, segments, segments),
            new THREE.MeshLambertMaterial({
                map: earthTexture,
                transparent: false
            })
        );
        const boundary = new THREE.Mesh(
            new THREE.SphereGeometry(globeRadius + 0.005, segments, segments),
            new THREE.MeshBasicMaterial({
                map: boundaryTexture,
                transparent: true,
                depthTest: true,
                opacity: 0.5,
                polygonOffset: true,
                polygonOffsetFactor: -1,
                polygonOffsetUnits: 1
            })
        );
        return { earth, boundary, fallback: false };
    };

    const createFallbackBundle = () => ({
        earth: new THREE.Mesh(
            new THREE.SphereGeometry(globeRadius, segments, segments),
            new THREE.MeshLambertMaterial({
                color: 0x6B93D6,
                transparent: false
            })
        ),
        boundary: null,
        fallback: true
    });

    const load = async () => {
        if (disposed) return null;

        const loadGeneration = ++generation;
        let earthTexture = null;
        let boundaryTexture = null;
        if (!bundle) notify();

        try {
            earthTexture = await loadTexture('/textures/8k_earth_v2.jpg');
            if (isStale(loadGeneration)) {
                earthTexture.dispose();
                return null;
            }

            boundaryTexture = await loadTexture('/textures/boundaries_8k.png');
            if (isStale(loadGeneration)) {
                earthTexture.dispose();
                boundaryTexture.dispose();
                return null;
            }

            const nextBundle = createTexturedBundle(earthTexture, boundaryTexture);
            return replaceBundle(nextBundle, loadGeneration) ? nextBundle : null;
        } catch (error) {
            earthTexture?.dispose();
            boundaryTexture?.dispose();
            if (isStale(loadGeneration)) return null;

            onFallback(error);
            const fallbackBundle = createFallbackBundle();
            return replaceBundle(fallbackBundle, loadGeneration)
                ? fallbackBundle
                : null;
        }
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
            const currentBundle = bundle;
            bundle = null;
            disposeBundle(rotationGroup, currentBundle);
            notify();
        }
    };
};
