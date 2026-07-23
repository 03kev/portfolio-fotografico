import * as THREE from 'three';
import { createWorldMapGlobeResources } from './WorldMapGlobeResources';

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

        await owner.load();
        const earth = owner.getEarth();

        expect(owner.getSnapshot()).toMatchObject({
            status: 'ready',
            earth,
            fallback: false,
            interactive: true
        });
        expect(rotationGroup.children).toHaveLength(2);
        expect(loadTexture).toHaveBeenCalledTimes(2);

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

        await owner.load();
        const firstChildren = [...rotationGroup.children];
        const geometryDisposeSpies = firstChildren.map((mesh) => (
            jest.spyOn(mesh.geometry, 'dispose')
        ));
        const materialDisposeSpies = firstChildren.map((mesh) => (
            jest.spyOn(mesh.material, 'dispose')
        ));

        await owner.load();

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

        const loading = owner.load();
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

        await owner.load();

        expect(owner.getSnapshot()).toMatchObject({
            status: 'ready',
            fallback: true,
            interactive: true
        });
        expect(rotationGroup.children).toHaveLength(1);
        expect(earthTexture.dispose).toHaveBeenCalledTimes(1);
        expect(onFallback).toHaveBeenCalledWith(loadError);

        owner.dispose();
    });
});
