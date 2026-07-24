import * as THREE from 'three';
import {
    WORLD_MAP_TEXTURE_SETS,
    configureBoundaryMaskTexture,
    createWorldMapGlobeResources,
    selectWorldMapTextureSet
} from './WorldMapGlobeResources';

const [SMALL_TEXTURE_SET, LARGE_TEXTURE_SET] = WORLD_MAP_TEXTURE_SETS;

const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });
    return { promise, resolve, reject };
};

const createTexture = () => {
    const texture = new THREE.Texture();
    jest.spyOn(texture, 'dispose');
    return texture;
};

const createOwner = (loadTexture) => {
    const rotationGroup = new THREE.Group();
    const onStateChange = jest.fn();
    const onFallback = jest.fn();
    const owner = createWorldMapGlobeResources({
        rotationGroup,
        loadTexture,
        globeRadius: 2,
        segments: 8,
        onStateChange,
        onFallback
    });
    return { owner, rotationGroup, onStateChange, onFallback };
};

describe('WorldMapGlobeResources', () => {
    test('owns one earth/boundary pair and restores the context without reloading it', async () => {
        const earthTexture = createTexture();
        const boundaryTexture = createTexture();
        const loadTexture = jest.fn()
            .mockResolvedValueOnce(earthTexture)
            .mockResolvedValueOnce(boundaryTexture);
        const { owner, rotationGroup } = createOwner(loadTexture);

        await owner.load(SMALL_TEXTURE_SET);
        const earth = owner.getEarth();

        expect(owner.getSnapshot()).toMatchObject({
            status: 'ready',
            earth,
            fallback: false,
            interactive: true
        });
        expect(rotationGroup.children).toHaveLength(2);
        expect(loadTexture).toHaveBeenCalledTimes(2);
        expect(rotationGroup.children[1].material).toBeInstanceOf(THREE.ShaderMaterial);
        expect(
            rotationGroup.children[1].material.uniforms.boundaryMask.value
        ).toBe(boundaryTexture);

        owner.markContextLost();
        expect(owner.getSnapshot()).toMatchObject({
            status: 'context-lost',
            interactive: false
        });

        owner.markContextRestored();
        owner.markContextRestored();

        expect(owner.getSnapshot()).toMatchObject({
            status: 'ready',
            earth,
            interactive: true
        });
        expect(rotationGroup.children).toHaveLength(2);
        expect(loadTexture).toHaveBeenCalledTimes(2);
        expect(earthTexture.dispose).not.toHaveBeenCalled();
        expect(boundaryTexture.dispose).not.toHaveBeenCalled();

        owner.dispose();
        expect(rotationGroup.children).toHaveLength(0);
        expect(earthTexture.dispose).toHaveBeenCalledTimes(1);
        expect(boundaryTexture.dispose).toHaveBeenCalledTimes(1);
    });

    test('replaces a loaded pair instead of appending duplicate meshes', async () => {
        const textures = Array.from({ length: 4 }, createTexture);
        const loadTexture = jest.fn();
        textures.forEach((texture) => loadTexture.mockResolvedValueOnce(texture));
        const { owner, rotationGroup } = createOwner(loadTexture);

        await owner.load(SMALL_TEXTURE_SET);
        const firstChildren = [...rotationGroup.children];
        const geometryDisposeSpies = firstChildren.map((mesh) => (
            jest.spyOn(mesh.geometry, 'dispose')
        ));
        const materialDisposeSpies = firstChildren.map((mesh) => (
            jest.spyOn(mesh.material, 'dispose')
        ));

        await owner.load(LARGE_TEXTURE_SET);

        expect(rotationGroup.children).toHaveLength(2);
        expect(rotationGroup.children).not.toEqual(firstChildren);
        geometryDisposeSpies.forEach((dispose) => {
            expect(dispose).toHaveBeenCalledTimes(1);
        });
        materialDisposeSpies.forEach((dispose) => {
            expect(dispose).toHaveBeenCalledTimes(1);
        });
        expect(textures[0].dispose).toHaveBeenCalledTimes(1);
        expect(textures[1].dispose).toHaveBeenCalledTimes(1);

        owner.dispose();
    });

    test('disposes a texture that finishes loading after the owner was disposed', async () => {
        const pendingEarth = deferred();
        const lateTexture = createTexture();
        const loadTexture = jest.fn(() => pendingEarth.promise);
        const { owner, rotationGroup } = createOwner(loadTexture);

        const loading = owner.load(SMALL_TEXTURE_SET);
        owner.dispose();
        pendingEarth.resolve(lateTexture);
        await loading;

        expect(owner.getSnapshot()).toMatchObject({
            status: 'disposed',
            earth: null,
            interactive: false
        });
        expect(rotationGroup.children).toHaveLength(0);
        expect(lateTexture.dispose).toHaveBeenCalledTimes(1);
        expect(loadTexture).toHaveBeenCalledTimes(1);
    });

    test('provides an interactive fallback without leaking a partially loaded texture', async () => {
        const earthTexture = createTexture();
        const loadError = new Error('boundary unavailable');
        const loadTexture = jest.fn()
            .mockResolvedValueOnce(earthTexture)
            .mockRejectedValueOnce(loadError);
        const { owner, rotationGroup, onFallback } = createOwner(loadTexture);

        await owner.load(SMALL_TEXTURE_SET);

        expect(owner.getSnapshot()).toMatchObject({
            status: 'ready',
            fallback: true,
            interactive: true
        });
        expect(rotationGroup.children).toHaveLength(1);
        expect(earthTexture.dispose).toHaveBeenCalledTimes(1);
        expect(onFallback).toHaveBeenCalledWith(loadError, {
            retainedExisting: false,
            textureSet: SMALL_TEXTURE_SET
        });

        owner.dispose();
    });

    test('retains the current pair when loading another resolution fails', async () => {
        const currentTextures = [createTexture(), createTexture()];
        const replacementEarth = createTexture();
        const loadError = new Error('replacement boundary unavailable');
        const loadTexture = jest.fn()
            .mockResolvedValueOnce(currentTextures[0])
            .mockResolvedValueOnce(currentTextures[1])
            .mockResolvedValueOnce(replacementEarth)
            .mockRejectedValueOnce(loadError);
        const { owner, rotationGroup, onFallback } = createOwner(loadTexture);

        await owner.load(SMALL_TEXTURE_SET);
        const currentChildren = [...rotationGroup.children];
        const result = await owner.load(LARGE_TEXTURE_SET);

        expect(result.earth).toBe(currentChildren[0]);
        expect(rotationGroup.children).toEqual(currentChildren);
        expect(owner.getSnapshot()).toMatchObject({
            status: 'ready',
            textureSet: SMALL_TEXTURE_SET,
            interactive: true
        });
        expect(replacementEarth.dispose).toHaveBeenCalledTimes(1);
        currentTextures.forEach((texture) => {
            expect(texture.dispose).not.toHaveBeenCalled();
        });
        expect(onFallback).toHaveBeenCalledWith(loadError, {
            retainedExisting: true,
            textureSet: LARGE_TEXTURE_SET
        });

        owner.dispose();
    });

    test('deduplicates concurrent requests for the same texture set', async () => {
        const pendingEarth = deferred();
        const earthTexture = createTexture();
        const boundaryTexture = createTexture();
        const loadTexture = jest.fn()
            .mockReturnValueOnce(pendingEarth.promise)
            .mockResolvedValueOnce(boundaryTexture);
        const { owner, rotationGroup } = createOwner(loadTexture);

        const firstRequest = owner.load(SMALL_TEXTURE_SET);
        const secondRequest = owner.load(SMALL_TEXTURE_SET);

        expect(secondRequest).toBe(firstRequest);
        expect(loadTexture).toHaveBeenCalledTimes(1);

        pendingEarth.resolve(earthTexture);
        await firstRequest;

        expect(loadTexture).toHaveBeenCalledTimes(2);
        expect(rotationGroup.children).toHaveLength(2);
        owner.dispose();
    });

    test('cancels a pending replacement when the current tier is selected again', async () => {
        const currentTextures = [createTexture(), createTexture()];
        const pendingReplacement = deferred();
        const lateReplacement = createTexture();
        const loadTexture = jest.fn()
            .mockResolvedValueOnce(currentTextures[0])
            .mockResolvedValueOnce(currentTextures[1])
            .mockReturnValueOnce(pendingReplacement.promise);
        const { owner, rotationGroup } = createOwner(loadTexture);

        await owner.load(SMALL_TEXTURE_SET);
        const currentChildren = [...rotationGroup.children];
        const replacementRequest = owner.load(LARGE_TEXTURE_SET);
        const currentResult = await owner.load(SMALL_TEXTURE_SET);
        pendingReplacement.resolve(lateReplacement);
        await replacementRequest;

        expect(currentResult.earth).toBe(currentChildren[0]);
        expect(rotationGroup.children).toEqual(currentChildren);
        expect(lateReplacement.dispose).toHaveBeenCalledTimes(1);
        expect(loadTexture).toHaveBeenCalledTimes(3);

        owner.dispose();
    });
});

describe('configureBoundaryMaskTexture', () => {
    test.each([
        [true, THREE.RedFormat],
        [false, THREE.LuminanceFormat]
    ])('uses a one-channel format when WebGL2 is %s', (isWebGL2, expectedFormat) => {
        const texture = new THREE.Texture();

        expect(configureBoundaryMaskTexture(texture, isWebGL2)).toBe(texture);
        expect(texture.format).toBe(expectedFormat);
        expect(texture.colorSpace).toBe(THREE.NoColorSpace);

        texture.dispose();
    });
});

describe('selectWorldMapTextureSet', () => {
    const baseOptions = {
        verticalFov: 50,
        globeRadius: 5,
        cameraDistance: 13,
        maxTextureSize: 8192
    };

    test('selects 2K for a small physical canvas', () => {
        expect(selectWorldMapTextureSet({
            ...baseOptions,
            canvasHeight: 400,
            pixelRatio: 1.5
        })).toBe(SMALL_TEXTURE_SET);
    });

    test('selects 4K when the physical canvas can display the additional detail', () => {
        expect(selectWorldMapTextureSet({
            ...baseOptions,
            canvasHeight: 650,
            pixelRatio: 1.5
        })).toBe(LARGE_TEXTURE_SET);
    });

    test('does not select a tier above the WebGL maximum texture size', () => {
        expect(selectWorldMapTextureSet({
            ...baseOptions,
            canvasHeight: 1200,
            pixelRatio: 2,
            maxTextureSize: 2048
        })).toBe(SMALL_TEXTURE_SET);
    });
});
