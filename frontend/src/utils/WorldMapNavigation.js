import * as THREE from 'three';

/**
 * WorldMapNavigation - Gestisce tutta la logica di navigazione e controllo del globo 3D
 * Include: mouse drag, touch, wheel/trackpad, inertia, auto-rotation
 */

// Configuration constants
export const GLOBE_RADIUS = 5;
export const CAMERA_START_Z = GLOBE_RADIUS * 2.5 + 0.5;
export const MIN_CAMERA_DISTANCE = GLOBE_RADIUS + 0.5;
export const MAX_CAMERA_DISTANCE = CAMERA_START_Z * 2;
export const AUTO_ROTATE_SPEED = 0.37; // rad/s
export const NAVIGATION_UPDATE_CAMERA = 1;
export const NAVIGATION_UPDATE_ROTATION = 2;

/**
 * Crea il sistema di controlli personalizzati per il WorldMap
 * @param {THREE.Camera} camera - Camera Three.js
 * @param {HTMLElement} domElement - Elemento DOM su cui agganciare gli eventi
 * @param {Object} refs - Riferimenti al mesh terrestre e al gruppo ruotabile
 * @param {Object} callbacks - Callback functions per gestire stati esterni
 * @returns {Object} Oggetto controls con tutti i metodi di navigazione
 */
export function createWorldMapNavigation(camera, domElement, refs, callbacks) {
    const { globeRef, rotationGroupRef } = refs;
    const { 
        disableAutoRotate, 
        scheduleAutoRotateResume, 
        setCanvasCursor, 
        isDraggingRef 
    } = callbacks;
    const TWO_PI = Math.PI * 2;
    const NORTH_LOCK_MAX_PITCH = Math.PI / 2 - 0.02;
    const NORTH_LOCK_MIN_RADIUS = 0.12;
    const WORLD_UP = new THREE.Vector3(0, 1, 0);
    const WORLD_RIGHT = new THREE.Vector3(1, 0, 0);
    const WORLD_FORWARD = new THREE.Vector3(0, 0, 1);
    const temp = {
        yawQuat: new THREE.Quaternion(),
        pitchQuat: new THREE.Quaternion(),
        candidateQuat: new THREE.Quaternion(),
        lockedQuat: new THREE.Quaternion(),
        horizontalQuat: new THREE.Quaternion(),
        verticalQuat: new THREE.Quaternion(),
        autoRotateQuat: new THREE.Quaternion(),
        deltaQuat: new THREE.Quaternion(),
        previousTarget: new THREE.Quaternion(),
        appliedQuat: new THREE.Quaternion(),
        cameraRight: new THREE.Vector3(),
        cameraUp: new THREE.Vector3(),
        rotationAxis: new THREE.Vector3(),
        angularAxis: new THREE.Vector3(),
        rayToSphere: new THREE.Vector3(),
        normalizedRayDirection: new THREE.Vector3(),
        projectedPoint: new THREE.Vector3(),
        ndc: new THREE.Vector2(),
        forward: new THREE.Vector3(),
        north: new THREE.Vector3()
    };
    const QUATERNION_EPSILON = 1e-12;

    const normalizeAngle = (angle) => {
        let normalized = angle % TWO_PI;
        if (normalized > Math.PI) normalized -= TWO_PI;
        if (normalized < -Math.PI) normalized += TWO_PI;
        return normalized;
    };

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    const buildNorthLockedQuaternion = (pitch, yaw, outQuat) => {
        const out = outQuat || new THREE.Quaternion();
        temp.pitchQuat.setFromAxisAngle(WORLD_RIGHT, pitch);
        temp.yawQuat.setFromAxisAngle(WORLD_UP, yaw);
        out.copy(temp.pitchQuat).multiply(temp.yawQuat);
        return out;
    };

    const computeNorthLockAngles = (sourceQuat) => {
        temp.lockedQuat.copy(sourceQuat).normalize();
        temp.forward.copy(WORLD_FORWARD).applyQuaternion(temp.lockedQuat);
        temp.north.copy(WORLD_UP).applyQuaternion(temp.lockedQuat);

        const yaw = normalizeAngle(Math.atan2(temp.forward.x, temp.forward.z));
        const pitch = clamp(
            Math.atan2(temp.north.z, temp.north.y),
            -NORTH_LOCK_MAX_PITCH,
            NORTH_LOCK_MAX_PITCH
        );
        return {
            yaw,
            pitch
        };
    };

    const solveNorthLockAnglesFromLocalPoint = (localPoint, worldPoint, previousYaw) => {
        let vx = localPoint.x;
        let vy = localPoint.y;
        let vz = localPoint.z;
        const wx = worldPoint.x;
        const wy = worldPoint.y;
        const wz = worldPoint.z;

        let radius = Math.sqrt(vx * vx + vz * vz);
        if (radius < 1e-5) {
            return {
                yaw: previousYaw,
                pitch: clamp(Math.atan2(wz, wy), -NORTH_LOCK_MAX_PITCH, NORTH_LOCK_MAX_PITCH)
            };
        }

        if (radius < NORTH_LOCK_MIN_RADIUS) {
            const scale = NORTH_LOCK_MIN_RADIUS / radius;
            vx *= scale;
            vz *= scale;
            const length = Math.sqrt(vx * vx + vy * vy + vz * vz);
            vx /= length;
            vy /= length;
            vz /= length;
            radius = Math.sqrt(vx * vx + vz * vz);
        }

        const baseLon = Math.atan2(vx, vz);
        const sine = Math.max(-1, Math.min(1, wx / radius));
        const a1 = Math.asin(sine);
        const a2 = Math.PI - a1;
        const yaw1 = normalizeAngle(a1 - baseLon);
        const yaw2 = normalizeAngle(a2 - baseLon);

        const candidateForYaw = (yaw) => {
            const sinYaw = Math.sin(yaw);
            const cosYaw = Math.cos(yaw);
            const vxYaw = vx * cosYaw + vz * sinYaw;
            const vzYaw = -vx * sinYaw + vz * cosYaw;
            const pitch = clamp(
                normalizeAngle(Math.atan2(wz, wy) - Math.atan2(vzYaw, vy)),
                -NORTH_LOCK_MAX_PITCH,
                NORTH_LOCK_MAX_PITCH
            );

            const sinPitch = Math.sin(pitch);
            const cosPitch = Math.cos(pitch);
            const rx = vxYaw;
            const ry = vy * cosPitch - vzYaw * sinPitch;
            const rz = vy * sinPitch + vzYaw * cosPitch;
            const dot = rx * wx + ry * wy + rz * wz;

            return {
                yaw: normalizeAngle(yaw),
                pitch,
                error: 1 - dot
            };
        };

        const c1 = candidateForYaw(yaw1);
        const c2 = candidateForYaw(yaw2);
        let chosen = c1.error <= c2.error ? c1 : c2;
        if (Math.abs(c1.error - c2.error) < 1e-3) {
            const d1 = Math.abs(normalizeAngle(c1.yaw - previousYaw));
            const d2 = Math.abs(normalizeAngle(c2.yaw - previousYaw));
            chosen = d1 <= d2 ? c1 : c2;
        }

        return {
            yaw: chosen.yaw,
            pitch: chosen.pitch
        };
    };

    const controls = {
        // Configuration
        enabled: true,
        enableZoom: true,
        enableDamping: true,
        dampingFactor: 0.05,
        dragResponsiveness: 0.41, // 0..1 (1 = immediate, lower = more "lag" while dragging)
        autoRotate: false,
        autoRotateSpeed: AUTO_ROTATE_SPEED,
        minDistance: MIN_CAMERA_DISTANCE,
        maxDistance: MAX_CAMERA_DISTANCE,
        northLocked: false, // Modalità blocco nord
        northLockYaw: 0,
        northLockPitch: 0,
        northLockJustEnabled: false,
        northLockTransitioning: false,
        northLockTransitionElapsed: 0,
        northLockTransitionDuration: 220,
        northLockTransitionFrom: new THREE.Quaternion(),
        northLockTransitionTo: new THREE.Quaternion(),

        // Spherical for zoom only
        spherical: new THREE.Spherical(),
        scale: 1,

        // Globe rotation state
        globeQuaternion: new THREE.Quaternion(),
        targetGlobeQuaternion: new THREE.Quaternion(),

        // Inertia system
        rotationVelocity: new THREE.Vector2(0, 0),
        lastMousePos: new THREE.Vector2(0, 0),
        lastRotationTime: Date.now(),
        inertiaEnabled: false,

        // State management
        state: { NONE: -1, ROTATE: 0, ZOOM: 1 },
        currentState: -1,

        // Mouse tracking for drag
        mouseStart: new THREE.Vector2(),
        mouseEnd: new THREE.Vector2(),
        mouseDelta: new THREE.Vector2(),

        // Raycaster for drag on sphere
        raycaster: new THREE.Raycaster(),
        dragStart: new THREE.Vector3(),
        dragCurrent: new THREE.Vector3(),
        dragStartLocal: new THREE.Vector3(),
        initialMousePos: null, // Store initial mouse position for precise tracking
        justStartedDrag: false,
        dragStartTime: 0,

        target: new THREE.Vector3(0, 0, 0),
        /**
         * Update loop principale - aggiorna camera, inertia, rotazioni
         */
        update: function(deltaSeconds = 1 / 60) {
            let updateFlags = 0;
            const safeDeltaSeconds = Number.isFinite(deltaSeconds)
                ? Math.max(0, Math.min(deltaSeconds, 0.05))
                : 1 / 60;
            const frameScale = safeDeltaSeconds * 60;

            // Update camera distance
            const previousRadius = this.spherical.radius;
            const nextRadius = Math.max(
                this.minDistance,
                Math.min(this.maxDistance, previousRadius * this.scale)
            );
            this.spherical.radius = nextRadius;
            this.scale = 1;
            if (
                Math.abs(nextRadius - previousRadius) > 1e-8
                || Math.abs(camera.position.z - nextRadius) > 1e-8
            ) {
                camera.position.set(0, 0, nextRadius);
                camera.lookAt(this.target);
                updateFlags |= NAVIGATION_UPDATE_CAMERA;
            }
            
            // Apply the single shared rotation used by earth, borders and markers.
            const rotationGroup = rotationGroupRef.current;
            if (rotationGroup) {
                if (this.northLocked && this.northLockTransitioning && this.currentState === this.state.NONE) {
                    this.northLockTransitionElapsed += safeDeltaSeconds * 1000;
                    const rawT = this.northLockTransitionElapsed / this.northLockTransitionDuration;
                    const t = Math.max(0, Math.min(1, rawT));
                    const eased = t * (2 - t);
                    this.globeQuaternion.copy(this.northLockTransitionFrom).slerp(this.northLockTransitionTo, eased);
                    this.targetGlobeQuaternion.copy(this.globeQuaternion);
                    if (t >= 1) {
                        this.northLockTransitioning = false;
                    }
                }

                // Apply inertia if enabled
                if (this.inertiaEnabled && this.currentState === this.state.NONE) {
                    if (this.northLocked && (this.northLockJustEnabled || this.northLockTransitioning)) {
                        // Avoid applying north-locked inertia until first user drag.
                    } else {
                        const inertiaDecay = 0.92; // How quickly inertia slows down (lower = faster decay)
                        const minVelocity = 0.00005; // Minimum velocity before stopping

                        if (Math.abs(this.rotationVelocity.x) > minVelocity || Math.abs(this.rotationVelocity.y) > minVelocity) {
                            if (this.northLocked) {
                                this.northLockYaw = normalizeAngle(
                                    this.northLockYaw + this.rotationVelocity.x * frameScale
                                );
                                this.northLockPitch = clamp(
                                    this.northLockPitch + this.rotationVelocity.y * frameScale,
                                    -NORTH_LOCK_MAX_PITCH,
                                    NORTH_LOCK_MAX_PITCH
                                );
                                this._updateNorthLockedQuaternion(this.targetGlobeQuaternion);
                            } else {
                                temp.cameraRight.copy(WORLD_RIGHT).applyQuaternion(camera.quaternion);
                                temp.cameraUp.copy(WORLD_UP).applyQuaternion(camera.quaternion);
                                temp.horizontalQuat.setFromAxisAngle(
                                    temp.cameraUp,
                                    -this.rotationVelocity.x * frameScale
                                );
                                temp.verticalQuat.setFromAxisAngle(
                                    temp.cameraRight,
                                    -this.rotationVelocity.y * frameScale
                                );

                                this.targetGlobeQuaternion.premultiply(temp.horizontalQuat);
                                this.targetGlobeQuaternion.premultiply(temp.verticalQuat);
                            }

                            // Preserve the existing 60 FPS feel at any actual frame rate.
                            this.rotationVelocity.multiplyScalar(Math.pow(inertiaDecay, frameScale));
                        } else {
                            // Stop inertia when velocity is too small
                            this.inertiaEnabled = false;
                            this.rotationVelocity.set(0, 0);
                        }
                    }
                }
                
                // Apply damping to globe rotation (tunable drag responsiveness)
                if (this.enableDamping) {
                    const hasRotationDelta = (
                        1 - Math.abs(this.globeQuaternion.dot(this.targetGlobeQuaternion))
                    ) > QUATERNION_EPSILON;
                    if (hasRotationDelta) {
                        if (this.currentState === this.state.ROTATE) {
                            if (this.northLocked) {
                                // Keep the globe tightly under the cursor in north-lock mode.
                                this.globeQuaternion.copy(this.targetGlobeQuaternion);
                            } else {
                                const clamped = Math.max(0, Math.min(1, this.dragResponsiveness));
                                const dragFactor = Math.max(0.05, Math.pow(clamped, 2.5));
                                const adjustedDragFactor = 1 - Math.pow(1 - dragFactor, frameScale);
                                if (adjustedDragFactor >= 1) {
                                    this.globeQuaternion.copy(this.targetGlobeQuaternion);
                                } else {
                                    this.globeQuaternion.slerp(this.targetGlobeQuaternion, adjustedDragFactor);
                                }
                            }
                        } else {
                            const adjustedDamping = 1 - Math.pow(1 - this.dampingFactor, frameScale);
                            this.globeQuaternion.slerp(this.targetGlobeQuaternion, adjustedDamping);
                        }
                    }
                } else {
                    this.globeQuaternion.copy(this.targetGlobeQuaternion);
                }
                
                // Auto-rotate if enabled
                if (this.autoRotate && this.currentState === this.state.NONE) {
                    if (this.northLocked && (this.northLockJustEnabled || this.northLockTransitioning)) {
                        // Skip auto-rotate until the user drags in north-lock mode.
                    } else if (this.northLocked) {
                        this.northLockYaw = normalizeAngle(
                            this.northLockYaw
                            + (-this.autoRotateSpeed * 2 * Math.PI / 60 / 60) * frameScale
                        );
                        this._updateNorthLockedQuaternion(this.targetGlobeQuaternion);
                    } else {
                        temp.autoRotateQuat.setFromAxisAngle(
                            WORLD_UP,
                            (-this.autoRotateSpeed * 2 * Math.PI / 60 / 60) * frameScale
                        );
                        this.targetGlobeQuaternion.premultiply(temp.autoRotateQuat);
                    }
                }
                
                const groupRotationChanged = (
                    1 - Math.abs(rotationGroup.quaternion.dot(this.globeQuaternion))
                ) > QUATERNION_EPSILON;
                if (groupRotationChanged) {
                    rotationGroup.quaternion.copy(this.globeQuaternion);
                    updateFlags |= NAVIGATION_UPDATE_ROTATION;
                }
            }

            return updateFlags;
        },

        /**
         * Mouse down handler - inizia il drag se clicchiamo sulla sfera
         */
        onMouseDown: function(event) {
            if (!this.enabled) return;
            event.preventDefault();
            
            switch (event.button) {
                case 0: // Left mouse button
                    // Get the point on the sphere where we clicked
                    const rect = domElement.getBoundingClientRect();
                    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
                    
                    if (globeRef.current) {
                        globeRef.current.updateWorldMatrix(true, false);
                    }
                    camera.updateMatrixWorld(true);
                    this.raycaster.setFromCamera(temp.ndc.set(x, y), camera);
                    const intersects = this.raycaster.intersectObject(globeRef.current, true);
                    const hitPoint = intersects.length > 0
                        ? this.dragCurrent.copy(intersects[0].point).normalize()
                        : this._getSpherePointFromNDC(x, y);
                    
                    if (hitPoint) {
                        // We clicked on the globe - enable drag rotation
                        this.currentState = this.state.ROTATE;
                        this.mouseStart.set(event.clientX, event.clientY);
                        this.justStartedDrag = true;
                        if (this.northLockTransitioning) {
                            this.northLockTransitioning = false;
                            if (this.northLocked) {
                                this._syncNorthLockFromQuaternion(this.globeQuaternion);
                                this.targetGlobeQuaternion.copy(this.globeQuaternion);
                            }
                        }

                        // Keep target in sync with the actual globe before the first drag move.
                        if (rotationGroupRef.current) {
                            this.globeQuaternion.copy(rotationGroupRef.current.quaternion);
                        }
                        this.targetGlobeQuaternion.copy(this.globeQuaternion);
                        
                        // Store the normalized intersection point
                        this.dragStart.copy(hitPoint);
                        if (this.northLocked) {
                            temp.candidateQuat.copy(this.targetGlobeQuaternion).invert();
                            this.dragStartLocal.copy(this.dragStart).applyQuaternion(temp.candidateQuat).normalize();
                        }
                        // Store the initial mouse position for this drag session
                        this.initialMousePos = new THREE.Vector2(x, y);
                        this.dragStartTime = Date.now();

                        
                        // Initialize velocity tracking
                        this.rotationVelocity.set(0, 0);
                        this.lastMousePos.set(x, y);
                        this.lastRotationTime = Date.now();
                        this.inertiaEnabled = false;
                        
                        disableAutoRotate();
                        scheduleAutoRotateResume();
                        
                        // Add event listeners
                        document.addEventListener('mousemove', this.onMouseMove);
                        document.addEventListener('mouseup', this.onMouseUp);
                        
                        isDraggingRef.current = true;
                        setCanvasCursor('grabbing');
                    } else {
                        // Clicked outside the globe - do nothing
                        this.currentState = this.state.NONE;
                        this.dragStart.set(0, 0, 0);
                        this.dragStartLocal.set(0, 0, 0);
                        this.initialMousePos = null;
                    }
                    break;
                default:
                    return;
            }
        },

        /**
         * Mouse move handler - gestisce il drag preciso sulla superficie della sfera
         */
        onMouseMove: function(event) {
            if (!this.enabled) return;
            event.preventDefault();
            
                if (this.currentState === this.state.ROTATE) {
                    this.mouseEnd.set(event.clientX, event.clientY);
                    
                    if (this.dragStart.lengthSq() > 0 && globeRef.current) {
                        // Precise Google Earth style dragging
                        const rect = domElement.getBoundingClientRect();
                        const currentX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                        const currentY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

                        if (this.justStartedDrag) {
                            this.mouseStart.copy(this.mouseEnd);
                            if (this.initialMousePos) {
                                this.initialMousePos.set(currentX, currentY);
                            } else {
                                this.initialMousePos = new THREE.Vector2(currentX, currentY);
                            }
                            if (globeRef.current) {
                                globeRef.current.updateWorldMatrix(true, false);
                            }
                            camera.updateMatrixWorld(true);
                            this.raycaster.setFromCamera(temp.ndc.set(currentX, currentY), camera);
                            const startHits = this.raycaster.intersectObject(globeRef.current, true);
                            const startPoint = startHits.length > 0
                                ? this.dragCurrent.copy(startHits[0].point).normalize()
                                : this._getSpherePointFromNDC(currentX, currentY);
                            if (startPoint) {
                                this.dragStart.copy(startPoint);
                                if (this.northLocked) {
                                    temp.candidateQuat.copy(this.targetGlobeQuaternion).invert();
                                    this.dragStartLocal.copy(this.dragStart).applyQuaternion(temp.candidateQuat).normalize();
                                }
                            }
                            this.lastRotationTime = Date.now();
                            this.dragStartTime = this.lastRotationTime;
                            this.justStartedDrag = false;
                            return;
                        }
                        if (this.northLocked && this.northLockJustEnabled) {
                            this.mouseStart.copy(this.mouseEnd);
                            if (this.initialMousePos) {
                                this.initialMousePos.set(currentX, currentY);
                            }
                            this.lastRotationTime = Date.now();
                            this.dragStartTime = this.lastRotationTime;
                            this.northLockJustEnabled = false;
                            disableAutoRotate();
                            scheduleAutoRotateResume();
                            return;
                        }

                    // Only proceed if we have a valid initial mouse position
                    if (this.initialMousePos) {
                        // Calculate mouse movement in normalized device coordinates
                        const deltaX = currentX - this.initialMousePos.x;
                        const deltaY = currentY - this.initialMousePos.y;
                        
                        // Ignore tiny movements to prevent jitter
                        const movementThreshold = 0.001;
                        if (Math.abs(deltaX) < movementThreshold && Math.abs(deltaY) < movementThreshold) {
                            return;
                        }
                        
                        this.raycaster.setFromCamera(temp.ndc.set(currentX, currentY), camera);
                        const hits = this.raycaster.intersectObject(globeRef.current, true);
                        const currentPoint = hits.length > 0
                            ? this.dragCurrent.copy(hits[0].point).normalize()
                            : this._getSpherePointFromNDC(currentX, currentY);
                        
                        if (currentPoint) {
                            // Use actual intersection point for more accurate tracking
                            const currentPointNormalized = this.dragCurrent.copy(currentPoint).normalize();

                            if (this.justStartedDrag) {
                                this.dragStart.copy(currentPointNormalized);
                                if (this.northLocked) {
                                    temp.candidateQuat.copy(this.targetGlobeQuaternion).invert();
                                    this.dragStartLocal.copy(this.dragStart).applyQuaternion(temp.candidateQuat).normalize();
                                }
                                this.initialMousePos.set(currentX, currentY);
                                this.lastRotationTime = Date.now();
                                this.justStartedDrag = false;
                                return;
                            }
                            
                            // Calculate the rotation needed to move dragStart to currentPoint
                            const rotationAxis = temp.rotationAxis.crossVectors(this.dragStart, currentPointNormalized);
                            const rotationAngle = this.dragStart.angleTo(currentPointNormalized);
                            const now = Date.now();
                            const isEarlyDrag = now - this.dragStartTime < 120;
                            if (isEarlyDrag && rotationAngle > Math.PI * 0.6) {
                                this.dragStart.copy(currentPointNormalized);
                                if (this.northLocked) {
                                    temp.candidateQuat.copy(this.targetGlobeQuaternion).invert();
                                    this.dragStartLocal.copy(this.dragStart).applyQuaternion(temp.candidateQuat).normalize();
                                }
                                this.initialMousePos.set(currentX, currentY);
                                this.lastRotationTime = now;
                                this.dragStartTime = now;
                                return;
                            }
                            
                            const hasRotation = rotationAxis.length() > 0.0001 && rotationAngle > 0.0001;
                            if (this.northLocked || hasRotation) {
                                const currentTime = Date.now();

                                if (this.northLocked) {
                                    if (this.dragStartLocal.lengthSq() === 0) {
                                        temp.candidateQuat.copy(this.targetGlobeQuaternion).invert();
                                        this.dragStartLocal.copy(this.dragStart).applyQuaternion(temp.candidateQuat).normalize();
                                    }
                                    const prevYaw = this.northLockYaw;
                                    const prevPitch = this.northLockPitch;
                                    const { yaw, pitch } = solveNorthLockAnglesFromLocalPoint(
                                        this.dragStartLocal,
                                        currentPointNormalized,
                                        prevYaw
                                    );
                                    const yawDelta = normalizeAngle(yaw - prevYaw);
                                    const pitchDelta = pitch - prevPitch;
                                    this.northLockYaw = yaw;
                                    this.northLockPitch = pitch;
                                    this._updateNorthLockedQuaternion(this.targetGlobeQuaternion);

                                    // Calculate velocity for inertia based on mouse movement
                                    const deltaTime = (currentTime - this.lastRotationTime) / 1000; // Convert to seconds
                                    
                                    if (deltaTime > 0 && deltaTime < 0.1) { // Ignore if too much time has passed
                                        const smoothingFactor = 0.3;
                                        this.rotationVelocity.x = this.rotationVelocity.x * smoothingFactor + yawDelta * (1 - smoothingFactor);
                                        this.rotationVelocity.y = this.rotationVelocity.y * smoothingFactor + pitchDelta * (1 - smoothingFactor);
                                    }
                                } else if (hasRotation) {
                                    rotationAxis.normalize();
                                    const prevTarget = temp.previousTarget.copy(this.targetGlobeQuaternion);
                                    const deltaQuat = temp.deltaQuat.setFromAxisAngle(rotationAxis, rotationAngle);

                                    // Apply rotation to target quaternion
                                    this.targetGlobeQuaternion.copy(prevTarget).premultiply(deltaQuat);
                                
                                    // Calculate velocity for inertia based on mouse movement
                                    const deltaTime = (currentTime - this.lastRotationTime) / 1000; // Convert to seconds
                                    
                                    if (deltaTime > 0 && deltaTime < 0.1) { // Ignore if too much time has passed
                                        const cameraRight = temp.cameraRight.copy(WORLD_RIGHT).applyQuaternion(camera.quaternion);
                                        const cameraUp = temp.cameraUp.copy(WORLD_UP).applyQuaternion(camera.quaternion);
                                        const appliedQuat = temp.appliedQuat.copy(prevTarget).invert()
                                            .multiply(this.targetGlobeQuaternion).normalize();
                                        const angle = 2 * Math.acos(Math.max(-1, Math.min(1, appliedQuat.w)));
                                        const s = Math.sqrt(1 - appliedQuat.w * appliedQuat.w);
                                        const axis = s < 1e-6
                                            ? temp.angularAxis.set(1, 0, 0)
                                            : temp.angularAxis.set(appliedQuat.x / s, appliedQuat.y / s, appliedQuat.z / s);
                                        const angular = axis.multiplyScalar(angle);
                                        const velocityScale = 0.0024;
                                        const instantVelX = -(angular.dot(cameraUp) / deltaTime) * velocityScale;
                                        const instantVelY = -(angular.dot(cameraRight) / deltaTime) * velocityScale;
                                        
                                        // Smooth velocity update with higher weight on recent movement
                                        const smoothingFactor = 0.3;
                                        this.rotationVelocity.x = this.rotationVelocity.x * smoothingFactor + instantVelX * (1 - smoothingFactor);
                                        this.rotationVelocity.y = this.rotationVelocity.y * smoothingFactor + instantVelY * (1 - smoothingFactor);
                                    }
                                }
                                
                                // Update dragStart to the new position after rotation for continuous tracking
                                this.dragStart.copy(currentPointNormalized);
                                
                                this.lastMousePos.set(currentX, currentY);
                                this.lastRotationTime = currentTime;
                            }
                        } else {
                            // If no intersection, try sphere projection for edge cases
                            this._handleSphereProjection(currentX, currentY);
                        }
                    }
                } else if (this.dragStart.lengthSq() === 0) {
                    // Screen-based rotation (when clicking outside globe or after leaving sphere)
                    this._handleScreenBasedRotation();
                }
                
                disableAutoRotate();
                scheduleAutoRotateResume();
            }
        },

        /**
         * Mouse up handler - termina il drag e abilita inertia se necessario
         */
        onMouseUp: function(event) {
            if (!this.enabled) return;
            
            document.removeEventListener('mousemove', this.onMouseMove);
            document.removeEventListener('mouseup', this.onMouseUp);
            
            // Enable inertia if we were dragging on the sphere
            if (this.currentState === this.state.ROTATE && this.dragStart.lengthSq() > 0) {
                this.inertiaEnabled = true;
            }
            
            this.currentState = this.state.NONE;
            this.justStartedDrag = false;
            this.dragStartLocal.set(0, 0, 0);
            
            isDraggingRef.current = false;
            
            // Update cursor based on current mouse position
            if (event) {
                const rect = domElement.getBoundingClientRect();
                const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
                
                this.raycaster.setFromCamera(temp.ndc.set(x, y), camera);
                const intersects = this.raycaster.intersectObject(globeRef.current);
                
                setCanvasCursor(intersects.length > 0 ? 'grab' : 'default');
            } else {
                // Fallback if event is not available
                setCanvasCursor('default');
            }
        },

        /**
         * Wheel handler - gestisce zoom e rotazione trackpad
         */
        onWheel: function(event) {
            if (!this.enabled) return;
            event.preventDefault();
            setCanvasCursor('grab');
            
            const absX = Math.abs(event.deltaX || 0);
            const absY = Math.abs(event.deltaY || 0);
            
            // Detect pinch zoom vs scroll
            const isPinch = !!(event.ctrlKey || event.metaKey);
            const isMouseWheel = !isPinch && absX < 1 && (event.deltaMode === 1 || absY >= 40);
            
            if (isPinch || isMouseWheel) {
                // Zoom
                if (!this.enableZoom) return;
                const zoomSpeed = 0.99;
                if (event.deltaY > 0) {
                    this.scale /= zoomSpeed;
                } else if (event.deltaY < 0) {
                    this.scale *= zoomSpeed;
                }
            } else {
                // Trackpad rotation with consistent camera axes
                const rotateSpeed = 0.002;
                const deltaX = event.deltaX || 0;
                const deltaY = event.deltaY || 0;

                if (this.northLocked) {
                    const yawDelta = deltaX * rotateSpeed;
                    const pitchDelta = -deltaY * rotateSpeed;
                    this.northLockYaw = normalizeAngle(this.northLockYaw + yawDelta);
                    this.northLockPitch = clamp(
                        this.northLockPitch + pitchDelta,
                        -NORTH_LOCK_MAX_PITCH,
                        NORTH_LOCK_MAX_PITCH
                    );
                    this._updateNorthLockedQuaternion(this.targetGlobeQuaternion);
                } else {
                    // Get camera's local axes with quaternion transformation
                    const cameraRight = temp.cameraRight.copy(WORLD_RIGHT).applyQuaternion(camera.quaternion);
                    const cameraUp = temp.cameraUp.copy(WORLD_UP).applyQuaternion(camera.quaternion);

                    // Create rotations around camera's local axes
                    const horizontalQuat = temp.horizontalQuat.setFromAxisAngle(cameraUp, -deltaX * rotateSpeed);
                    const verticalQuat = temp.verticalQuat.setFromAxisAngle(cameraRight, -deltaY * rotateSpeed);

                    // Apply to target quaternion
                    this.targetGlobeQuaternion.premultiply(horizontalQuat);
                    this.targetGlobeQuaternion.premultiply(verticalQuat);
                }
            }
            
            disableAutoRotate();
            scheduleAutoRotateResume();
        },

        /**
         * Touch start handler - inizia il drag touch sulla sfera
         */
        onTouchStart: function(event) {
            if (!this.enabled) return;
            if (event.touches.length === 1) {
                // Try to get touch point on sphere
                const rect = domElement.getBoundingClientRect();
                const x = ((event.touches[0].clientX - rect.left) / rect.width) * 2 - 1;
                const y = -((event.touches[0].clientY - rect.top) / rect.height) * 2 + 1;
                
                if (globeRef.current) {
                    globeRef.current.updateWorldMatrix(true, false);
                }
                camera.updateMatrixWorld(true);
                this.raycaster.setFromCamera(temp.ndc.set(x, y), camera);
                const intersects = this.raycaster.intersectObject(globeRef.current, true);
                const hitPoint = intersects.length > 0
                    ? this.dragCurrent.copy(intersects[0].point).normalize()
                    : this._getSpherePointFromNDC(x, y);
                
                if (hitPoint) {
                    // We touched the globe - enable drag rotation
                    this.currentState = this.state.ROTATE;
                    this.mouseStart.set(event.touches[0].pageX, event.touches[0].pageY);
                    this.justStartedDrag = true;
                    if (this.northLockTransitioning) {
                        this.northLockTransitioning = false;
                        if (this.northLocked) {
                            this._syncNorthLockFromQuaternion(this.globeQuaternion);
                            this.targetGlobeQuaternion.copy(this.globeQuaternion);
                        }
                    }

                    // Keep target in sync with the actual globe before the first drag move.
                    if (rotationGroupRef.current) {
                        this.globeQuaternion.copy(rotationGroupRef.current.quaternion);
                    }
                    this.targetGlobeQuaternion.copy(this.globeQuaternion);
                    
                    // Store the normalized intersection point
                    this.dragStart.copy(hitPoint);
                    if (this.northLocked) {
                        temp.candidateQuat.copy(this.targetGlobeQuaternion).invert();
                        this.dragStartLocal.copy(this.dragStart).applyQuaternion(temp.candidateQuat).normalize();
                    }
                    this.initialMousePos = new THREE.Vector2(x, y);
                    this.dragStartTime = Date.now();

                    this.rotationVelocity.set(0, 0);
                    this.lastRotationTime = Date.now();
                    this.inertiaEnabled = false;
                } else {
                    // Touched outside the globe - do nothing
                    this.currentState = this.state.NONE;
                    this.dragStart.set(0, 0, 0);
                    this.dragStartLocal.set(0, 0, 0);
                    this.initialMousePos = null;
                }
            }
        },

        /**
         * Touch move handler - gestisce il drag touch preciso
         */
        onTouchMove: function(event) {
            if (!this.enabled) return;
            event.preventDefault();
            
            if (event.touches.length === 1 && this.currentState === this.state.ROTATE) {
                this.mouseEnd.set(event.touches[0].pageX, event.touches[0].pageY);
                
                if (this.dragStart.lengthSq() > 0) {
                    // Precise Google Earth style touch dragging
                    const rect = domElement.getBoundingClientRect();
                    const currentX = ((event.touches[0].clientX - rect.left) / rect.width) * 2 - 1;
                    const currentY = -((event.touches[0].clientY - rect.top) / rect.height) * 2 + 1;

                    if (this.justStartedDrag) {
                        this.mouseStart.copy(this.mouseEnd);
                        if (this.initialMousePos) {
                            this.initialMousePos.set(currentX, currentY);
                        } else {
                            this.initialMousePos = new THREE.Vector2(currentX, currentY);
                        }
                        if (globeRef.current) {
                            globeRef.current.updateWorldMatrix(true, false);
                        }
                        camera.updateMatrixWorld(true);
                        this.raycaster.setFromCamera(temp.ndc.set(currentX, currentY), camera);
                        const startHits = this.raycaster.intersectObject(globeRef.current, true);
                        const startPoint = startHits.length > 0
                            ? this.dragCurrent.copy(startHits[0].point).normalize()
                            : this._getSpherePointFromNDC(currentX, currentY);
                        if (startPoint) {
                            this.dragStart.copy(startPoint);
                            if (this.northLocked) {
                                temp.candidateQuat.copy(this.targetGlobeQuaternion).invert();
                                this.dragStartLocal.copy(this.dragStart).applyQuaternion(temp.candidateQuat).normalize();
                            }
                        }
                        this.lastRotationTime = Date.now();
                        this.dragStartTime = this.lastRotationTime;
                        this.justStartedDrag = false;
                        return;
                    }
                    if (this.northLocked && this.northLockJustEnabled) {
                        this.mouseStart.copy(this.mouseEnd);
                        if (this.initialMousePos) {
                            this.initialMousePos.set(currentX, currentY);
                        }
                        this.lastRotationTime = Date.now();
                        this.dragStartTime = this.lastRotationTime;
                        this.northLockJustEnabled = false;
                        return;
                    }

                    if (this.initialMousePos) {
                        // Calculate touch movement
                        const deltaX = currentX - this.initialMousePos.x;
                        const deltaY = currentY - this.initialMousePos.y;
                        
                        // Ignore tiny movements to prevent jitter
                        const movementThreshold = 0.002; // Slightly higher for touch
                        if (Math.abs(deltaX) < movementThreshold && Math.abs(deltaY) < movementThreshold) {
                            return;
                        }
                        
                        this.raycaster.setFromCamera(temp.ndc.set(currentX, currentY), camera);
                        const hits = this.raycaster.intersectObject(globeRef.current, true);
                        const currentPoint = hits.length > 0
                            ? this.dragCurrent.copy(hits[0].point).normalize()
                            : this._getSpherePointFromNDC(currentX, currentY);
                        
                        if (currentPoint) {
                            // Use actual intersection point for more accurate tracking
                            const currentPointNormalized = this.dragCurrent.copy(currentPoint).normalize();

                            if (this.justStartedDrag) {
                                this.dragStart.copy(currentPointNormalized);
                                if (this.northLocked) {
                                    temp.candidateQuat.copy(this.targetGlobeQuaternion).invert();
                                    this.dragStartLocal.copy(this.dragStart).applyQuaternion(temp.candidateQuat).normalize();
                                }
                                this.initialMousePos.set(currentX, currentY);
                                this.lastRotationTime = Date.now();
                                this.justStartedDrag = false;
                                return;
                            }
                            
                            const rotationAxis = temp.rotationAxis.crossVectors(this.dragStart, currentPointNormalized);
                            const rotationAngle = this.dragStart.angleTo(currentPointNormalized);
                            const now = Date.now();
                            const isEarlyDrag = now - this.dragStartTime < 140;
                            if (isEarlyDrag && rotationAngle > Math.PI * 0.6) {
                                this.dragStart.copy(currentPointNormalized);
                                if (this.northLocked) {
                                    temp.candidateQuat.copy(this.targetGlobeQuaternion).invert();
                                    this.dragStartLocal.copy(this.dragStart).applyQuaternion(temp.candidateQuat).normalize();
                                }
                                this.initialMousePos.set(currentX, currentY);
                                this.lastRotationTime = now;
                                this.dragStartTime = now;
                                return;
                            }
                            
                            const hasRotation = rotationAxis.length() > 0.0001 && rotationAngle > 0.0001;
                            if (this.northLocked || hasRotation) {
                                if (this.northLocked) {
                                    if (this.dragStartLocal.lengthSq() === 0) {
                                        temp.candidateQuat.copy(this.targetGlobeQuaternion).invert();
                                        this.dragStartLocal.copy(this.dragStart).applyQuaternion(temp.candidateQuat).normalize();
                                    }
                                    const { yaw, pitch } = solveNorthLockAnglesFromLocalPoint(
                                        this.dragStartLocal,
                                        currentPointNormalized,
                                        this.northLockYaw
                                    );
                                    this.northLockYaw = yaw;
                                    this.northLockPitch = pitch;
                                    this._updateNorthLockedQuaternion(this.targetGlobeQuaternion);
                                } else if (hasRotation) {
                                    rotationAxis.normalize();
                                    const deltaQuat = temp.deltaQuat.setFromAxisAngle(rotationAxis, rotationAngle);
                                    const prevTarget = temp.previousTarget.copy(this.targetGlobeQuaternion);
                                    this.targetGlobeQuaternion.copy(prevTarget).premultiply(deltaQuat);
                                }
                                
                                this.dragStart.copy(currentPointNormalized);
                            }
                        } else {
                            // If no intersection, try sphere projection for edge cases
                            this._handleSphereProjection(currentX, currentY);
                        }
                    }
                } else {
                    // Screen-based touch rotation
                    this._handleScreenBasedRotation();
                }
                
                disableAutoRotate();
                scheduleAutoRotateResume();
            }
        },

        /**
         * Touch end handler - termina il touch
         */
        onTouchEnd: function() {
            this.currentState = this.state.NONE;
            this.justStartedDrag = false;
            this.dragStartLocal.set(0, 0, 0);
        },

        /**
         * Helper method - gestisce la proiezione sulla sfera quando il mouse esce dal bordo
         */
        _getSpherePointFromNDC: function(x, y) {
            this.raycaster.setFromCamera(temp.ndc.set(x, y), camera);
            const ray = this.raycaster.ray;
            const sphereRadius = GLOBE_RADIUS;
            const toSphere = temp.rayToSphere.copy(ray.origin).negate();
            const normalizedDir = temp.normalizedRayDirection.copy(ray.direction).normalize();
            const dot = toSphere.dot(normalizedDir);
            const discriminant = dot * dot - (toSphere.lengthSq() - sphereRadius * sphereRadius);
            if (discriminant < 0) {
                return null;
            }
            const sqrtDisc = Math.sqrt(discriminant);
            let t = dot - sqrtDisc;
            if (t <= 0) {
                t = dot + sqrtDisc;
            }
            if (t <= 0) {
                return null;
            }
            return temp.projectedPoint.copy(ray.origin).addScaledVector(normalizedDir, t).normalize();
        },

        /**
         * Helper method - gestisce la proiezione sulla sfera quando il mouse esce dal bordo
         */
        _handleSphereProjection: function(currentX, currentY) {
            const ray = this.raycaster.ray;
            const sphereRadius = GLOBE_RADIUS;
            
            // Project ray onto sphere surface even if it doesn't intersect
            const toSphere = temp.rayToSphere.copy(ray.origin).negate();
            const toCameraDistance = toSphere.length();
            const normalizedDir = temp.normalizedRayDirection.copy(ray.direction).normalize();
            
            // Calculate the closest point on the sphere to the ray
            const dot = toSphere.dot(normalizedDir);
            const discriminant = dot * dot - (toCameraDistance * toCameraDistance - sphereRadius * sphereRadius);
            
            if (discriminant >= 0) {
                // There's a valid projection
                const t = dot - Math.sqrt(discriminant);
                if (t > 0) {
                    const projectedPoint = temp.projectedPoint.copy(ray.origin).addScaledVector(normalizedDir, t);
                    const currentPoint = projectedPoint.normalize();
                    
                    const rotationAxis = temp.rotationAxis.crossVectors(this.dragStart, currentPoint);
                    const rotationAngle = this.dragStart.angleTo(currentPoint);
                    
                    if (rotationAxis.length() > 0.0001 && rotationAngle > 0.0001) {
                        rotationAxis.normalize();
                        const prevTarget = temp.previousTarget.copy(this.targetGlobeQuaternion);
                        const deltaQuat = temp.deltaQuat.setFromAxisAngle(rotationAxis, rotationAngle);
                        if (this.northLocked) {
                            if (this.dragStartLocal.lengthSq() === 0) {
                                temp.candidateQuat.copy(this.targetGlobeQuaternion).invert();
                                this.dragStartLocal.copy(this.dragStart).applyQuaternion(temp.candidateQuat).normalize();
                            }
                            const prevYaw = this.northLockYaw;
                            const prevPitch = this.northLockPitch;
                            const { yaw, pitch } = solveNorthLockAnglesFromLocalPoint(
                                this.dragStartLocal,
                                currentPoint,
                                prevYaw
                            );
                            const yawDelta = normalizeAngle(yaw - prevYaw);
                            const pitchDelta = pitch - prevPitch;
                            this.northLockYaw = yaw;
                            this.northLockPitch = pitch;
                            this._updateNorthLockedQuaternion(this.targetGlobeQuaternion);

                            // Update velocity for inertia (mouse only)
                            if (this.lastMousePos && this.lastRotationTime) {
                                const currentTime = Date.now();
                                const deltaTime = (currentTime - this.lastRotationTime) / 1000;
                                
                                if (deltaTime > 0 && deltaTime < 0.1) {
                                    const smoothingFactor = 0.3;
                                    this.rotationVelocity.x = this.rotationVelocity.x * smoothingFactor + yawDelta * (1 - smoothingFactor);
                                    this.rotationVelocity.y = this.rotationVelocity.y * smoothingFactor + pitchDelta * (1 - smoothingFactor);
                                }
                                
                                this.lastMousePos.set(currentX, currentY);
                                this.lastRotationTime = currentTime;
                            }
                        } else {
                            this.targetGlobeQuaternion.copy(prevTarget).premultiply(deltaQuat);
                            
                            // Update velocity for inertia (only for mouse, not touch)
                            if (this.lastMousePos && this.lastRotationTime) {
                                const currentTime = Date.now();
                                const deltaTime = (currentTime - this.lastRotationTime) / 1000;
                                
                                if (deltaTime > 0 && deltaTime < 0.1) {
                                    const cameraRight = temp.cameraRight.copy(WORLD_RIGHT).applyQuaternion(camera.quaternion);
                                    const cameraUp = temp.cameraUp.copy(WORLD_UP).applyQuaternion(camera.quaternion);
                                    const appliedQuat = temp.appliedQuat.copy(prevTarget).invert()
                                        .multiply(this.targetGlobeQuaternion).normalize();
                                    const angle = 2 * Math.acos(Math.max(-1, Math.min(1, appliedQuat.w)));
                                    const s = Math.sqrt(1 - appliedQuat.w * appliedQuat.w);
                                    const axis = s < 1e-6
                                        ? temp.angularAxis.set(1, 0, 0)
                                        : temp.angularAxis.set(appliedQuat.x / s, appliedQuat.y / s, appliedQuat.z / s);
                                    const angular = axis.multiplyScalar(angle);
                                    const velocityScale = 0.0024;
                                    const instantVelX = -(angular.dot(cameraUp) / deltaTime) * velocityScale;
                                    const instantVelY = (angular.dot(cameraRight) / deltaTime) * velocityScale;
                                    
                                    const smoothingFactor = 0.3;
                                    this.rotationVelocity.x = this.rotationVelocity.x * smoothingFactor + instantVelX * (1 - smoothingFactor);
                                    this.rotationVelocity.y = this.rotationVelocity.y * smoothingFactor + instantVelY * (1 - smoothingFactor);
                                }
                                
                                this.lastMousePos.set(currentX, currentY);
                                this.lastRotationTime = currentTime;
                            }
                        }
                        
                        this.dragStart.copy(currentPoint);
                    }
                }
            } else {
                // Mouse is too far outside - release drag with inertia
                this.dragStart.set(0, 0, 0);
                this.dragStartLocal.set(0, 0, 0);
                this.initialMousePos = null;
                
                // Enable inertia with softened velocity to avoid edge snap
                this.rotationVelocity.multiplyScalar(0.35);
                this.inertiaEnabled = true;
                
                // Trigger mouse up to release drag
                this.currentState = this.state.NONE;
                isDraggingRef.current = false;
                setCanvasCursor('default');
            }
        },

        /**
         * Helper method - gestisce la rotazione basata su schermo quando non siamo sulla sfera
         */
        _handleScreenBasedRotation: function() {
            this.mouseDelta.subVectors(this.mouseEnd, this.mouseStart);
            
            const rotateSpeed = 0.005;
            
            if (this.northLocked) {
                const rect = domElement.getBoundingClientRect();
                const lockedSpeed = (Math.PI * 0.6) / Math.min(rect.width, rect.height);
                const yawDelta = this.mouseDelta.x * lockedSpeed;
                const pitchDelta = -this.mouseDelta.y * lockedSpeed;

                this.northLockYaw = normalizeAngle(this.northLockYaw + yawDelta);
                this.northLockPitch = clamp(
                    this.northLockPitch + pitchDelta,
                    -NORTH_LOCK_MAX_PITCH,
                    NORTH_LOCK_MAX_PITCH
                );
                this._updateNorthLockedQuaternion(this.targetGlobeQuaternion);
            } else {
                // Get camera's local axes with consistent quaternion transformation
                const cameraRight = temp.cameraRight.copy(WORLD_RIGHT).applyQuaternion(camera.quaternion);
                const cameraUp = temp.cameraUp.copy(WORLD_UP).applyQuaternion(camera.quaternion);

                // Create rotations around camera's local axes
                const horizontalQuat = temp.horizontalQuat.setFromAxisAngle(cameraUp, -this.mouseDelta.x * rotateSpeed);
                const verticalQuat = temp.verticalQuat.setFromAxisAngle(cameraRight, -this.mouseDelta.y * rotateSpeed);

                // Apply to target quaternion
                this.targetGlobeQuaternion.premultiply(horizontalQuat);
                this.targetGlobeQuaternion.premultiply(verticalQuat);
            }
            
            this.mouseStart.copy(this.mouseEnd);
        },

        /**
         * Helper method - sincronizza yaw/pitch dal quaternione corrente
         */
        _syncNorthLockFromQuaternion: function(quaternion) {
            const { pitch, yaw } = computeNorthLockAngles(quaternion);
            this.northLockPitch = pitch;
            this.northLockYaw = yaw;
            return buildNorthLockedQuaternion(this.northLockPitch, this.northLockYaw, temp.lockedQuat);
        },

        /**
         * Helper method - aggiorna quaternion in modalità north lock (yaw attorno al polo)
         */
        _buildNorthLockedQuaternion: function(pitch, yaw, outQuat) {
            return buildNorthLockedQuaternion(pitch, yaw, outQuat);
        },

        _updateNorthLockedQuaternion: function(targetQuaternion) {
            const target = targetQuaternion || this.targetGlobeQuaternion;
            buildNorthLockedQuaternion(this.northLockPitch, this.northLockYaw, target);
            return target;
        },

        /**
         * Public method - applica il blocco del nord alla rotazione corrente
         */
        applyNorthLock: function() {
            const sourceQuat = this.globeQuaternion;
            const lockedQuat = this._syncNorthLockFromQuaternion(sourceQuat);
            this.northLockTransitioning = true;
            this.northLockTransitionElapsed = 0;
            this.northLockTransitionFrom.copy(sourceQuat);
            this.northLockTransitionTo.copy(lockedQuat);
            this.rotationVelocity.set(0, 0);
            this.inertiaEnabled = false;
        },

        /**
         * Public method - entra in modalità north lock senza cambiare orientamento
         */
        enterNorthLock: function() {
            const sourceQuat = rotationGroupRef.current
                ? rotationGroupRef.current.quaternion
                : this.globeQuaternion;
            const lockedQuat = this._syncNorthLockFromQuaternion(sourceQuat);
            this.northLockTransitioning = true;
            this.northLockTransitionElapsed = 0;
            this.northLockTransitionFrom.copy(sourceQuat);
            this.northLockTransitionTo.copy(lockedQuat);
            this.northLockJustEnabled = true;
            this.rotationVelocity.set(0, 0);
            this.inertiaEnabled = false;
        },

        /**
         * Bind all event handlers
         */
        bindEventHandlers: function() {
            this.onMouseDown = this.onMouseDown.bind(this);
            this.onMouseMove = this.onMouseMove.bind(this);
            this.onMouseUp = this.onMouseUp.bind(this);
            this.onWheel = this.onWheel.bind(this);
            this.onTouchStart = this.onTouchStart.bind(this);
            this.onTouchMove = this.onTouchMove.bind(this);
            this.onTouchEnd = this.onTouchEnd.bind(this);
            
            domElement.addEventListener('mousedown', this.onMouseDown);
            domElement.addEventListener('wheel', this.onWheel, { passive: false });
            domElement.addEventListener('touchstart', this.onTouchStart, { passive: true });
            domElement.addEventListener('touchmove', this.onTouchMove, { passive: false });
            domElement.addEventListener('touchend', this.onTouchEnd);
        },

        /**
         * Clean up event listeners
         */
        dispose: function() {
            domElement.removeEventListener('mousedown', this.onMouseDown);
            domElement.removeEventListener('wheel', this.onWheel);
            domElement.removeEventListener('touchstart', this.onTouchStart);
            domElement.removeEventListener('touchmove', this.onTouchMove);
            domElement.removeEventListener('touchend', this.onTouchEnd);
            
            document.removeEventListener('mousemove', this.onMouseMove);
            document.removeEventListener('mouseup', this.onMouseUp);
        }
    };
    
    // Initialize spherical from camera position
    controls.spherical.setFromVector3(camera.position.clone().sub(controls.target));
    
    // Initialize globe quaternion
    if (rotationGroupRef.current) {
        controls.globeQuaternion.copy(rotationGroupRef.current.quaternion);
        controls.targetGlobeQuaternion.copy(rotationGroupRef.current.quaternion);
    }
    
    controls.bindEventHandlers();
    
    return controls;
}

/**
 * Helper functions per canvas/mouse cursor management
 */
export const NavigationHelpers = {
    /**
     * Gestisce mouse enter/leave events per il cursore
     */
    setupCanvasEvents: function(canvas, controls, setCanvasCursor) {
        const handleMouseEnter = () => {
            if (controls && controls.raycaster && controls.target) {
                // Set appropriate cursor based on intersection
                setCanvasCursor('grab');
            }
        };

        const handleMouseLeave = () => {
            setCanvasCursor('default');
        };

        const handleMouseMove = (event) => {
            if (!controls || !controls.raycaster) return;
            
            const rect = canvas.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            
            // Only update cursor if we're not dragging
            if (!controls.isDragging && controls.globeRef?.current) {
                controls.raycaster.setFromCamera(new THREE.Vector2(x, y), controls.camera);
                const intersects = controls.raycaster.intersectObject(controls.globeRef.current);
                setCanvasCursor(intersects.length > 0 ? 'grab' : 'default');
            }
        };

        canvas.addEventListener('mouseenter', handleMouseEnter);
        canvas.addEventListener('mouseleave', handleMouseLeave);
        canvas.addEventListener('mousemove', handleMouseMove);

        // Return cleanup function
        return () => {
            canvas.removeEventListener('mouseenter', handleMouseEnter);
            canvas.removeEventListener('mouseleave', handleMouseLeave);
            canvas.removeEventListener('mousemove', handleMouseMove);
        };
    }
};
