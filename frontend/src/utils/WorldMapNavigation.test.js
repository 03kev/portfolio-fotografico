import * as THREE from 'three';
import {
    CAMERA_START_Z,
    GLOBE_RADIUS,
    createWorldMapNavigation
} from './WorldMapNavigation';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const WORLD_FORWARD = new THREE.Vector3(0, 0, 1);

const normalizeAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const quaternionAngle = (first, second) => (
    2 * Math.acos(Math.min(1, Math.abs(first.dot(second))))
);

const createHarness = (initialQuaternion = new THREE.Quaternion()) => {
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        right: 500,
        bottom: 500,
        width: 500,
        height: 500
    });

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(0, 0, CAMERA_START_Z);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    const scene = new THREE.Scene();
    const rotationGroup = new THREE.Group();
    rotationGroup.quaternion.copy(initialQuaternion);
    const globe = new THREE.Mesh(
        new THREE.SphereGeometry(GLOBE_RADIUS, 16, 16),
        new THREE.MeshBasicMaterial()
    );
    rotationGroup.add(globe);
    scene.add(rotationGroup);
    scene.updateMatrixWorld(true);

    const globeRef = { current: globe };
    const isDraggingRef = { current: false };
    const setCanvasCursor = jest.fn();
    const controls = createWorldMapNavigation(
        camera,
        canvas,
        {
            globeRef,
            rotationGroupRef: { current: rotationGroup }
        },
        {
            disableAutoRotate: jest.fn(),
            scheduleAutoRotateResume: jest.fn(),
            setCanvasCursor,
            isDraggingRef
        }
    );

    return {
        canvas,
        camera,
        controls,
        globe,
        globeRef,
        isDraggingRef,
        rotationGroup,
        setCanvasCursor,
        dispose: () => {
            controls.dispose();
            globe.geometry.dispose();
            globe.material.dispose();
        }
    };
};

describe('WorldMapNavigation resource readiness', () => {
    test('ignores pointer starts when the globe resource is unavailable', () => {
        const harness = createHarness();
        const { controls, globeRef } = harness;
        globeRef.current = null;

        expect(() => controls.onMouseDown({
            button: 0,
            clientX: 250,
            clientY: 250,
            preventDefault: jest.fn()
        })).not.toThrow();
        expect(() => controls.onTouchStart({
            touches: [{ clientX: 250, clientY: 250 }]
        })).not.toThrow();
        expect(controls.currentState).toBe(controls.state.NONE);

        harness.dispose();
    });

    test('cancels an active interaction without enabling inertia', () => {
        const harness = createHarness();
        const { controls, isDraggingRef, setCanvasCursor } = harness;
        controls.currentState = controls.state.ROTATE;
        controls.dragStart.set(1, 0, 0);
        controls.initialMousePos = new THREE.Vector2(0, 0);
        controls.inertiaEnabled = true;
        controls.rotationVelocity.set(1, 1);
        isDraggingRef.current = true;

        controls.cancelInteraction();

        expect(controls.currentState).toBe(controls.state.NONE);
        expect(controls.dragStart.lengthSq()).toBe(0);
        expect(controls.initialMousePos).toBeNull();
        expect(controls.inertiaEnabled).toBe(false);
        expect(controls.rotationVelocity.lengthSq()).toBe(0);
        expect(isDraggingRef.current).toBe(false);
        expect(setCanvasCursor).toHaveBeenLastCalledWith('default');

        harness.dispose();
    });
});

describe('WorldMapNavigation north lock', () => {
    test('straightens north while preserving the location at screen centre', () => {
        const initialQuaternion = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(0.35, -0.8, 0.5, 'XYZ')
        );
        const harness = createHarness(initialQuaternion);
        const { controls, rotationGroup } = harness;
        const centredLocalPoint = WORLD_FORWARD.clone()
            .applyQuaternion(initialQuaternion.clone().invert())
            .normalize();

        controls.northLocked = true;
        controls.enterNorthLock();
        for (let frame = 0; frame < 20; frame += 1) {
            controls.update(1 / 60);
        }

        const centredAfterLock = centredLocalPoint.clone()
            .applyQuaternion(rotationGroup.quaternion)
            .normalize();
        const northAfterLock = WORLD_UP.clone()
            .applyQuaternion(rotationGroup.quaternion)
            .normalize();

        expect(centredAfterLock.angleTo(WORLD_FORWARD)).toBeLessThan(1e-6);
        expect(Math.abs(northAfterLock.x)).toBeLessThan(1e-6);
        expect(northAfterLock.y).toBeGreaterThan(0);

        harness.dispose();
    });

    test('keeps the grabbed location under the pointer across a continuous drag', () => {
        const harness = createHarness();
        const { controls, rotationGroup } = harness;
        controls.northLocked = true;
        controls.northLockPitch = 0.28;
        controls.northLockYaw = -0.65;
        controls._updateNorthLockedQuaternion(controls.globeQuaternion);
        controls.targetGlobeQuaternion.copy(controls.globeQuaternion);
        rotationGroup.quaternion.copy(controls.globeQuaternion);

        const startPoint = controls._getSpherePointFromNDC(0.14, 0.1).clone();
        controls._beginNorthLockedDrag(startPoint);
        const grabbedLocalPoint = controls.dragStartLocal.clone();
        let previousYaw = controls.northLockYaw;

        [305, 325, 345, 365, 385].forEach((clientX, index) => {
            const clientY = 225 + index * 4;
            const expectedPoint = controls._getSpherePointFromNDC(
                (clientX / 500) * 2 - 1,
                -((clientY / 500) * 2 - 1)
            ).clone();

            expect(controls._handleNorthLockedAnchoredDrag(
                clientX,
                clientY,
                1000 + index * 16,
                false
            )).toBe(true);

            const mappedPoint = grabbedLocalPoint.clone()
                .applyQuaternion(controls.targetGlobeQuaternion)
                .normalize();
            const mappedNorth = WORLD_UP.clone()
                .applyQuaternion(controls.targetGlobeQuaternion)
                .normalize();
            const yawStep = Math.abs(normalizeAngle(controls.northLockYaw - previousYaw));

            expect(mappedPoint.angleTo(expectedPoint)).toBeLessThan(1e-6);
            expect(Math.abs(mappedNorth.x)).toBeLessThan(1e-6);
            expect(mappedNorth.y).toBeGreaterThan(0);
            expect(yawStep).toBeLessThan(0.5);
            previousYaw = controls.northLockYaw;
        });

        harness.dispose();
    });

    test('centres an externally focused location without desynchronizing north-lock state', () => {
        const harness = createHarness();
        const { controls } = harness;
        const focusedLocation = new THREE.Vector3(0.42, 0.61, 0.67).normalize();
        controls.northLocked = true;
        controls.northLockPitch = -0.2;
        controls.northLockYaw = 1.1;

        const target = controls.createNorthLockedTarget(focusedLocation);
        expect(target).not.toBeNull();
        controls.syncNorthLockState(target);

        const centredLocation = focusedLocation.clone()
            .applyQuaternion(controls.globeQuaternion)
            .normalize();
        const mappedNorth = WORLD_UP.clone()
            .applyQuaternion(controls.globeQuaternion)
            .normalize();
        const synchronizedTarget = controls._updateNorthLockedQuaternion(new THREE.Quaternion());

        expect(centredLocation.angleTo(WORLD_FORWARD)).toBeLessThan(1e-6);
        expect(Math.abs(mappedNorth.x)).toBeLessThan(1e-6);
        expect(mappedNorth.y).toBeGreaterThan(0);
        expect(1 - Math.abs(synchronizedTarget.dot(target))).toBeLessThan(1e-12);

        harness.dispose();
    });

    test('does not snap when the pointer crosses the globe silhouette', () => {
        const harness = createHarness();
        const { controls } = harness;
        controls.northLocked = true;
        controls._updateNorthLockedQuaternion(controls.globeQuaternion);
        controls.targetGlobeQuaternion.copy(controls.globeQuaternion);

        const startPoint = controls._getSpherePointFromNDC(0, 0).clone();
        controls._beginNorthLockedDrag(startPoint);

        expect(controls._handleNorthLockedAnchoredDrag(400, 250, 984, false)).toBe(true);
        let previousOrientation = controls.targetGlobeQuaternion.clone();
        [420, 435, 445, 452, 457, 460].forEach((clientX, index) => {
            expect(controls._handleNorthLockedAnchoredDrag(
                clientX,
                250,
                1000 + index * 16,
                false
            )).toBe(true);
            expect(quaternionAngle(
                previousOrientation,
                controls.targetGlobeQuaternion
            )).toBeLessThan(0.2);
            previousOrientation.copy(controls.targetGlobeQuaternion);
        });

        const orientationAtEdge = controls.targetGlobeQuaternion.clone();
        expect(controls._handleNorthLockedAnchoredDrag(600, 250, 1112, false)).toBe(true);
        expect(controls.northLockPointerOutside).toBe(true);
        expect(1 - Math.abs(
            controls.targetGlobeQuaternion.dot(orientationAtEdge)
        )).toBeLessThan(1e-12);

        expect(controls._handleNorthLockedAnchoredDrag(455, 250, 1128, false)).toBe(true);
        expect(controls.northLockPointerOutside).toBe(false);
        expect(1 - Math.abs(
            controls.targetGlobeQuaternion.dot(orientationAtEdge)
        )).toBeLessThan(1e-12);

        const orientationAtReentry = controls.targetGlobeQuaternion.clone();
        expect(controls._handleNorthLockedAnchoredDrag(445, 240, 1144, false)).toBe(true);
        expect(quaternionAngle(
            orientationAtReentry,
            controls.targetGlobeQuaternion
        )).toBeLessThan(0.2);

        harness.dispose();
    });
});

describe('WorldMapNavigation direct manipulation', () => {
    test('uses the analytic sphere hit test instead of triangle raycasting on drag start', () => {
        const harness = createHarness();
        const { controls } = harness;
        const triangleRaycast = jest.spyOn(controls.raycaster, 'intersectObject');

        controls.onMouseDown({
            button: 0,
            clientX: 250,
            clientY: 250,
            preventDefault: jest.fn()
        });

        expect(controls.currentState).toBe(controls.state.ROTATE);
        expect(controls.dragStart.lengthSq()).toBeGreaterThan(0);
        expect(triangleRaycast).not.toHaveBeenCalled();

        controls.cancelInteraction();
        harness.dispose();
    });

    test('does not add damping lag while the globe is actively dragged', () => {
        const harness = createHarness();
        const { controls, rotationGroup } = harness;
        const dragTarget = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(0.18, -0.42, 0.11, 'XYZ')
        );

        controls.currentState = controls.state.ROTATE;
        controls.targetGlobeQuaternion.copy(dragTarget);
        controls.update(1 / 60);

        expect(1 - Math.abs(controls.globeQuaternion.dot(dragTarget))).toBeLessThan(1e-12);
        expect(1 - Math.abs(rotationGroup.quaternion.dot(dragTarget))).toBeLessThan(1e-12);

        harness.dispose();
    });

    test('limits raycast amplification only near the globe silhouette', () => {
        const harness = createHarness();
        const { controls } = harness;
        const centrePoint = controls._getSpherePointFromNDC(0, 0).clone();
        const edgePoint = controls._getSpherePointFromNDC(0.87, 0).clone();

        expect(controls._limitRotationNearSilhouette(
            0.5,
            centrePoint,
            0.01
        )).toBeCloseTo(0.5, 12);
        expect(controls._limitRotationNearSilhouette(
            0.5,
            edgePoint,
            0.01
        )).toBeLessThan(0.2);

        harness.dispose();
    });
});
