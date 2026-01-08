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

/**
 * Crea il sistema di controlli personalizzati per il WorldMap
 * @param {THREE.Camera} camera - Camera Three.js
 * @param {HTMLElement} domElement - Elemento DOM su cui agganciare gli eventi
 * @param {Object} refs - Riferimenti agli oggetti del globo (globeRef, markersRef)
 * @param {Object} callbacks - Callback functions per gestire stati esterni
 * @returns {Object} Oggetto controls con tutti i metodi di navigazione
 */
export function createWorldMapNavigation(camera, domElement, refs, callbacks) {
    const { globeRef, markersRef } = refs;
    const { 
        disableAutoRotate, 
        scheduleAutoRotateResume, 
        setCanvasCursor, 
        isDraggingRef 
    } = callbacks;

    const controls = {
        // Configuration
        enabled: true,
        enableZoom: true,
        enableDamping: true,
        dampingFactor: 0.05,
        dragResponsiveness: 0.35, // 0..1 (1 = immediate, lower = more "lag" while dragging)
        autoRotate: false,
        autoRotateSpeed: AUTO_ROTATE_SPEED,
        minDistance: MIN_CAMERA_DISTANCE,
        maxDistance: MAX_CAMERA_DISTANCE,
        northLocked: false, // Modalità blocco nord

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
        initialMousePos: null, // Store initial mouse position for precise tracking

        target: new THREE.Vector3(0, 0, 0),
        boundaryMesh: null, // Reference to boundary mesh if exists

        /**
         * Update loop principale - aggiorna camera, inertia, rotazioni
         */
        update: function() {
            // Update camera distance
            this.spherical.radius *= this.scale;
            this.spherical.radius = Math.max(this.minDistance, Math.min(this.maxDistance, this.spherical.radius));
            
            // Keep camera fixed, looking at center
            camera.position.set(0, 0, this.spherical.radius);
            camera.lookAt(this.target);
            
            // Apply rotation to globe and synchronize markers/borders
            if (globeRef.current) {
                // Apply inertia if enabled
                if (this.inertiaEnabled && this.currentState === this.state.NONE) {
                    const inertiaDecay = 0.92; // How quickly inertia slows down (lower = faster decay)
                    const minVelocity = 0.00005; // Minimum velocity before stopping
                    
                    if (Math.abs(this.rotationVelocity.x) > minVelocity || Math.abs(this.rotationVelocity.y) > minVelocity) {
                        // Apply inertia rotation
                        if (this.northLocked) {
                            const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
                            const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
                            
                            const horizontalQuat = new THREE.Quaternion().setFromAxisAngle(cameraUp, -this.rotationVelocity.x);
                            const verticalQuat = new THREE.Quaternion().setFromAxisAngle(cameraRight, -this.rotationVelocity.y);
                            
                            this.targetGlobeQuaternion.premultiply(horizontalQuat);
                            this.targetGlobeQuaternion.premultiply(verticalQuat);
                            this._applyNorthLockQuaternion(this.targetGlobeQuaternion);
                        } else {
                            const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
                            const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
                            
                            const horizontalQuat = new THREE.Quaternion().setFromAxisAngle(cameraUp, -this.rotationVelocity.x);
                            const verticalQuat = new THREE.Quaternion().setFromAxisAngle(cameraRight, -this.rotationVelocity.y);
                            
                            this.targetGlobeQuaternion.premultiply(horizontalQuat);
                            this.targetGlobeQuaternion.premultiply(verticalQuat);
                        }
                        
                        // Decay velocity
                        this.rotationVelocity.multiplyScalar(inertiaDecay);
                    } else {
                        // Stop inertia when velocity is too small
                        this.inertiaEnabled = false;
                        this.rotationVelocity.set(0, 0);
                    }
                }
                
                // Apply damping to globe rotation (tunable drag responsiveness)
                if (this.enableDamping) {
                    if (this.currentState === this.state.ROTATE) {
                        const clamped = Math.max(0, Math.min(1, this.dragResponsiveness));
                        const dragFactor = Math.max(0.05, Math.pow(clamped, 2.5));
                        if (dragFactor >= 1) {
                            this.globeQuaternion.copy(this.targetGlobeQuaternion);
                        } else {
                            this.globeQuaternion.slerp(this.targetGlobeQuaternion, dragFactor);
                        }
                    } else {
                        this.globeQuaternion.slerp(this.targetGlobeQuaternion, this.dampingFactor);
                    }
                } else {
                    this.globeQuaternion.copy(this.targetGlobeQuaternion);
                }
                
                // Auto-rotate if enabled
                if (this.autoRotate && this.currentState === this.state.NONE) {
                    const autoRotateQuat = new THREE.Quaternion().setFromAxisAngle(
                        new THREE.Vector3(0, 1, 0),
                        -this.autoRotateSpeed * 2 * Math.PI / 60 / 60
                    );
                    this.targetGlobeQuaternion.premultiply(autoRotateQuat);
                }
                
                // Apply final rotation to globe
                globeRef.current.quaternion.copy(this.globeQuaternion);
                
                // Synchronize markers with globe rotation
                if (markersRef.current) {
                    markersRef.current.forEach(marker => {
                        if (marker.originalPosition) {
                            // Apply globe rotation to the original position (which doesn't have offset)
                            const rotatedPos = marker.originalPosition.clone().applyQuaternion(this.globeQuaternion);
                            marker.position.copy(rotatedPos);
                            
                            // Update marker orientation to face outward
                            const normal = rotatedPos.clone().normalize();
                            marker.lookAt(rotatedPos.clone().add(normal));
                        }
                    });
                }
                
                // Synchronize boundary mesh if it exists
                if (this.boundaryMesh) {
                    this.boundaryMesh.quaternion.copy(this.globeQuaternion);
                }
            }
            
            // Reset scale
            this.scale = 1;
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
                    
                    this.raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
                    
                    // Check if we clicked on the actual globe
                    const intersects = this.raycaster.intersectObject(globeRef.current);
                    
                    if (intersects.length > 0) {
                        // We clicked on the globe - enable drag rotation
                        this.currentState = this.state.ROTATE;
                        this.mouseStart.set(event.clientX, event.clientY);
                        
                        // Store the normalized intersection point
                        this.dragStart.copy(intersects[0].point).normalize();
                        // Store the initial mouse position for this drag session
                        this.initialMousePos = new THREE.Vector2(x, y);
                        
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
                        this.initialMousePos = null;
                    }
                    break;
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
                        
                        // Project current mouse position onto the sphere using proper sphere projection
                        this.raycaster.setFromCamera(new THREE.Vector2(currentX, currentY), camera);
                        
                        // Calculate intersection with the visible sphere
                        const intersects = this.raycaster.intersectObject(globeRef.current);
                        
                        if (intersects.length > 0) {
                            // Use actual intersection point for more accurate tracking
                            const currentPoint = intersects[0].point.clone().normalize();
                            
                            // Calculate the rotation needed to move dragStart to currentPoint
                            const rotationAxis = new THREE.Vector3().crossVectors(this.dragStart, currentPoint);
                            const rotationAngle = this.dragStart.angleTo(currentPoint);
                            
                            // Only rotate if there's a meaningful angle and axis
                            if (rotationAxis.length() > 0.0001 && rotationAngle > 0.0001) {
                                rotationAxis.normalize();
                                
                                // Create rotation quaternion
                                const deltaQuat = new THREE.Quaternion().setFromAxisAngle(rotationAxis, rotationAngle);
                                
                                // Apply rotation to target quaternion
                                this.targetGlobeQuaternion.premultiply(deltaQuat);
                                
                                // Se il nord è bloccato, mantieni il polo nord in alto
                                if (this.northLocked) {
                                    const correction = this._applyNorthLockQuaternion(this.targetGlobeQuaternion);
                                    if (correction) {
                                        currentPoint.applyQuaternion(correction);
                                    }
                                }
                                
                                // Update dragStart to the new position after rotation for continuous tracking
                                this.dragStart.copy(currentPoint);
                                
                                // Calculate velocity for inertia based on mouse movement
                                const currentTime = Date.now();
                                const deltaTime = (currentTime - this.lastRotationTime) / 1000; // Convert to seconds
                                
                                if (deltaTime > 0 && deltaTime < 0.1) { // Ignore if too much time has passed
                                    const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
                                    const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
                                    const angular = rotationAxis.clone().multiplyScalar(rotationAngle);
                                    const velocityScale = 0.0024;
                                    const instantVelX = -(angular.dot(cameraUp) / deltaTime) * velocityScale;
                                    const instantVelY = -(angular.dot(cameraRight) / deltaTime) * velocityScale;
                                    
                                    // Smooth velocity update with higher weight on recent movement
                                    const smoothingFactor = 0.3;
                                    this.rotationVelocity.x = this.rotationVelocity.x * smoothingFactor + instantVelX * (1 - smoothingFactor);
                                    this.rotationVelocity.y = this.rotationVelocity.y * smoothingFactor + instantVelY * (1 - smoothingFactor);
                                }
                                
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
            
            isDraggingRef.current = false;
            
            // Update cursor based on current mouse position
            if (event) {
                const rect = domElement.getBoundingClientRect();
                const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
                
                this.raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
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
                    const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
                    const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
                    
                    const horizontalQuat = new THREE.Quaternion().setFromAxisAngle(cameraUp, -deltaX * rotateSpeed);
                    const verticalQuat = new THREE.Quaternion().setFromAxisAngle(cameraRight, -deltaY * rotateSpeed);
                    
                    this.targetGlobeQuaternion.premultiply(horizontalQuat);
                    this.targetGlobeQuaternion.premultiply(verticalQuat);
                    this._applyNorthLockQuaternion(this.targetGlobeQuaternion);
                } else {
                    // Get camera's local axes with quaternion transformation
                    const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
                    const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
                    
                    // Create rotations around camera's local axes  
                    const horizontalQuat = new THREE.Quaternion().setFromAxisAngle(cameraUp, -deltaX * rotateSpeed);
                    const verticalQuat = new THREE.Quaternion().setFromAxisAngle(cameraRight, -deltaY * rotateSpeed);
                    
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
                
                this.raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
                
                // Check if we touched the actual globe
                const intersects = this.raycaster.intersectObject(globeRef.current);
                
                if (intersects.length > 0) {
                    // We touched the globe - enable drag rotation
                    this.currentState = this.state.ROTATE;
                    this.mouseStart.set(event.touches[0].pageX, event.touches[0].pageY);
                    
                    // Store the normalized intersection point
                    this.dragStart.copy(intersects[0].point).normalize();
                    this.initialMousePos = new THREE.Vector2(x, y);
                } else {
                    // Touched outside the globe - do nothing
                    this.currentState = this.state.NONE;
                    this.dragStart.set(0, 0, 0);
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
                    
                    if (this.initialMousePos) {
                        // Calculate touch movement
                        const deltaX = currentX - this.initialMousePos.x;
                        const deltaY = currentY - this.initialMousePos.y;
                        
                        // Ignore tiny movements to prevent jitter
                        const movementThreshold = 0.002; // Slightly higher for touch
                        if (Math.abs(deltaX) < movementThreshold && Math.abs(deltaY) < movementThreshold) {
                            return;
                        }
                        
                        // Project current touch position onto the sphere using proper sphere projection
                        this.raycaster.setFromCamera(new THREE.Vector2(currentX, currentY), camera);
                        
                        // Calculate intersection with the visible sphere
                        const intersects = this.raycaster.intersectObject(globeRef.current);
                        
                        if (intersects.length > 0) {
                            // Use actual intersection point for more accurate tracking
                            const currentPoint = intersects[0].point.clone().normalize();
                            
                            const rotationAxis = new THREE.Vector3().crossVectors(this.dragStart, currentPoint);
                            const rotationAngle = this.dragStart.angleTo(currentPoint);
                            
                            if (rotationAxis.length() > 0.0001 && rotationAngle > 0.0001) {
                                rotationAxis.normalize();
                                const deltaQuat = new THREE.Quaternion().setFromAxisAngle(rotationAxis, rotationAngle);
                                this.targetGlobeQuaternion.premultiply(deltaQuat);
                                
                                // Se il nord è bloccato, mantieni il polo nord in alto
                                if (this.northLocked) {
                                    const correction = this._applyNorthLockQuaternion(this.targetGlobeQuaternion);
                                    if (correction) {
                                        currentPoint.applyQuaternion(correction);
                                    }
                                }
                                
                                this.dragStart.copy(currentPoint);
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
        },

        /**
         * Helper method - gestisce la proiezione sulla sfera quando il mouse esce dal bordo
         */
        _handleSphereProjection: function(currentX, currentY) {
            const ray = this.raycaster.ray;
            const sphereRadius = GLOBE_RADIUS;
            
            // Project ray onto sphere surface even if it doesn't intersect
            const toSphere = ray.origin.clone().negate();
            const toCameraDistance = toSphere.length();
            const normalizedDir = ray.direction.clone().normalize();
            
            // Calculate the closest point on the sphere to the ray
            const dot = toSphere.dot(normalizedDir);
            const discriminant = dot * dot - (toCameraDistance * toCameraDistance - sphereRadius * sphereRadius);
            
            if (discriminant >= 0) {
                // There's a valid projection
                const t = dot - Math.sqrt(discriminant);
                if (t > 0) {
                    const projectedPoint = ray.origin.clone().add(normalizedDir.multiplyScalar(t));
                    const currentPoint = projectedPoint.normalize();
                    
                    const rotationAxis = new THREE.Vector3().crossVectors(this.dragStart, currentPoint);
                    const rotationAngle = this.dragStart.angleTo(currentPoint);
                    
                    if (rotationAxis.length() > 0.0001 && rotationAngle > 0.0001) {
                        rotationAxis.normalize();
                        const deltaQuat = new THREE.Quaternion().setFromAxisAngle(rotationAxis, rotationAngle);
                        this.targetGlobeQuaternion.premultiply(deltaQuat);
                        
                        // Se il nord è bloccato, mantieni il polo nord in alto
                        if (this.northLocked) {
                            const correction = this._applyNorthLockQuaternion(this.targetGlobeQuaternion);
                            if (correction) {
                                currentPoint.applyQuaternion(correction);
                            }
                        }
                        
                        this.dragStart.copy(currentPoint);
                        
                        // Update velocity for inertia (only for mouse, not touch)
                        if (this.lastMousePos && this.lastRotationTime) {
                            const currentTime = Date.now();
                            const deltaTime = (currentTime - this.lastRotationTime) / 1000;
                            
                            if (deltaTime > 0 && deltaTime < 0.1) {
                                const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
                                const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
                                const angular = rotationAxis.clone().multiplyScalar(rotationAngle);
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
                }
            } else {
                // Mouse is too far outside - release drag with inertia
                this.dragStart.set(0, 0, 0);
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
            
            // Get camera's local axes with consistent quaternion transformation
            const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
            const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
            
            // Create rotations around camera's local axes
            const horizontalQuat = new THREE.Quaternion().setFromAxisAngle(cameraUp, -this.mouseDelta.x * rotateSpeed);
            const verticalQuat = new THREE.Quaternion().setFromAxisAngle(cameraRight, -this.mouseDelta.y * rotateSpeed);
            
            // Apply to target quaternion
            this.targetGlobeQuaternion.premultiply(horizontalQuat);
            this.targetGlobeQuaternion.premultiply(verticalQuat);
            
            // Se il nord è bloccato, mantieni il polo nord in alto
            if (this.northLocked) {
                this._applyNorthLockQuaternion(this.targetGlobeQuaternion);
            }
            
            this.mouseStart.copy(this.mouseEnd);
        },

        /**
         * Helper method - quando il nord è bloccato, rimuove solo l'inclinazione laterale (Z)
         */
        _removeInclinationFromQuaternion: function(quaternion) {
            // Estrai gli angoli di Eulero dal quaternione
            const euler = new THREE.Euler().setFromQuaternion(quaternion, 'YXZ');
            
            // Mantieni X (movimento verticale/latitudine) e Y (movimento orizzontale/longitudine)
            // Rimuovi solo Z (inclinazione laterale/rotazione dell'orizzonte)
            // Questo permette di esplorare tutte le latitudini mantenendo l'orizzonte dritto
            const cleanEuler = new THREE.Euler(euler.x, euler.y, 0, 'YXZ');
            
            // Ricrea il quaternione pulito
            quaternion.setFromEuler(cleanEuler);
        },

        /**
         * Helper method - blocca il polo nord in alto (yaw only)
         */
        _applyNorthLockQuaternion: function(quaternion) {
            const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
            const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
            const cameraForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            
            const north = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
            const x = north.dot(cameraRight);
            const y = north.dot(cameraUp);
            
            const roll = Math.atan2(x, y);
            if (Math.abs(roll) < 1e-6) {
                return null;
            }
            
            const correction = new THREE.Quaternion().setFromAxisAngle(cameraForward, -roll);
            quaternion.premultiply(correction);
            return correction;
        },

        /**
         * Public method - applica il blocco del nord alla rotazione corrente
         */
        applyNorthLock: function() {
            this._applyNorthLockQuaternion(this.targetGlobeQuaternion);
            this.globeQuaternion.copy(this.targetGlobeQuaternion);
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
    if (globeRef.current) {
        controls.globeQuaternion.copy(globeRef.current.quaternion);
        controls.targetGlobeQuaternion.copy(globeRef.current.quaternion);
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
