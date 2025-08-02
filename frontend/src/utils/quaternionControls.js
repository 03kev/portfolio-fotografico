import * as THREE from 'three';

// Creates custom controls for the camera with free rotation using quaternions
export const createQuaternionControls = (camera, domElement, options = {}) => {
    const {
        autoRotateSpeed,
        minDistance,
        maxDistance,
        disableAutoRotate,
        scheduleAutoRotateResume,
        setCanvasCursor,
        isDraggingRef,
        GLOBE_RADIUS = 5,
        CAMERA_START_Z = 13.5
    } = options;

    const controls = {
        enabled: true,
        autoRotate: false,
        autoRotateSpeed: autoRotateSpeed,
        enableDamping: true,
        dampingFactor: 0.08,
        enableZoom: true,
        minDistance: minDistance,
        maxDistance: maxDistance,
        enablePan: false,
        
        // Usa quaternioni per rotazioni libere senza limiti ai poli
        quaternion: new THREE.Quaternion(),
        quaternionDelta: new THREE.Quaternion(),
        
        scale: 1,
        radius: CAMERA_START_Z,
        
        state: { NONE: -1, ROTATE: 0, ZOOM: 1 },
        currentState: -1,
        
        rotateStart: new THREE.Vector2(),
        rotateEnd: new THREE.Vector2(),
        rotateDelta: new THREE.Vector2(),
        
        target: new THREE.Vector3(0, 0, 0),
        
        // Aggiungiamo variabili per il tracking del punto cliccato
        dragStartVector: new THREE.Vector3(),
        isDragTracking: false,
        
        update: function() {
            // Applica il quaternione delta al quaternione corrente
            this.quaternion.multiplyQuaternions(this.quaternionDelta, this.quaternion);
            
            // Calcola la nuova posizione della camera
            const position = new THREE.Vector3(0, 0, this.radius);
            position.applyQuaternion(this.quaternion);
            camera.position.copy(position);
            
            // La camera guarda sempre il centro
            camera.up.set(0, 1, 0);
            camera.up.applyQuaternion(this.quaternion);
            camera.lookAt(this.target);
            
            // Auto-rotazione
            if (this.autoRotate && this.currentState === this.state.NONE) {
                const autoRotateAngle = this.autoRotateSpeed * 2 * Math.PI / 60 / 60;
                const autoQuat = new THREE.Quaternion().setFromAxisAngle(
                    new THREE.Vector3(0, 1, 0), 
                    autoRotateAngle
                );
                this.quaternion.multiplyQuaternions(autoQuat, this.quaternion);
            }
            
            // Zoom
            this.radius *= this.scale;
            this.radius = Math.max(this.minDistance, Math.min(this.maxDistance, this.radius));
            
            // Damping
            if (this.enableDamping) {
                // Slerp verso quaternione identità per il damping
                this.quaternionDelta.slerp(new THREE.Quaternion(), this.dampingFactor);
            } else {
                this.quaternionDelta.set(0, 0, 0, 1);
            }
            
            this.scale = 1;
        },
        
        onMouseDown: function(event) {
            if (!this.enabled) return;
            event.preventDefault();
            
            switch (event.button) {
                case 0:
                    this.currentState = this.state.ROTATE;
                    this.rotateStart.set(event.clientX, event.clientY);
                    
                    // Calcola quale punto del globo è stato cliccato
                    const rect = domElement.getBoundingClientRect();
                    const mouse = new THREE.Vector2();
                    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
                    
                    const raycaster = new THREE.Raycaster();
                    raycaster.setFromCamera(mouse, camera);
                    
                    // Interseca con una sfera invisibile del raggio del globo
                    const globeSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), GLOBE_RADIUS);
                    const intersectPoint = new THREE.Vector3();
                    
                    if (raycaster.ray.intersectSphere(globeSphere, intersectPoint)) {
                        // Abbiamo cliccato sul globo, salva il punto
                        this.dragStartVector.copy(intersectPoint).normalize();
                        this.isDragTracking = true;
                    } else {
                        // Non abbiamo cliccato sul globo, usa il drag normale
                        this.isDragTracking = false;
                    }
                    
                    disableAutoRotate();
                    scheduleAutoRotateResume();
                    break;
            }
            
            if (this.currentState !== this.state.NONE) {
                document.addEventListener('mousemove', this.onMouseMove);
                document.addEventListener('mouseup', this.onMouseUp);
            }
            
            isDraggingRef.current = true;
            setCanvasCursor('grabbing');
        },
        
        onMouseMove: function(event) {
            if (!this.enabled) return;
            event.preventDefault();
            
            if (this.currentState === this.state.ROTATE) {
                if (this.isDragTracking) {
                    // Nuovo sistema: mantieni il punto cliccato sotto il cursore
                    const rect = domElement.getBoundingClientRect();
                    const mouse = new THREE.Vector2();
                    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
                    
                    const raycaster = new THREE.Raycaster();
                    raycaster.setFromCamera(mouse, camera);
                    
                    // Calcola dove dovrebbe essere il punto ora
                    const globeSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), GLOBE_RADIUS);
                    const targetPoint = new THREE.Vector3();
                    
                    if (raycaster.ray.intersectSphere(globeSphere, targetPoint)) {
                        targetPoint.normalize();
                        
                        // Trasforma i punti nello spazio locale della camera
                        const localStart = this.dragStartVector.clone();
                        const localTarget = targetPoint.clone();
                        
                        // Applica l'inverso del quaternione corrente per ottenere i vettori in spazio mondo
                        const invQuat = this.quaternion.clone().invert();
                        localStart.applyQuaternion(invQuat);
                        localTarget.applyQuaternion(invQuat);
                        
                        // Calcola l'asse e l'angolo di rotazione
                        const axis = new THREE.Vector3().crossVectors(localStart, localTarget);
                        
                        if (axis.lengthSq() > 0.000001) {
                            axis.normalize();
                            const angle = localStart.angleTo(localTarget);
                            
                            // Crea un quaternione per questa rotazione con damping
                            const dampedAngle = angle * 0.5; // Riduci la velocità della rotazione
                            const rotQuat = new THREE.Quaternion().setFromAxisAngle(axis, dampedAngle);
                            
                            // Applica la rotazione
                            this.quaternionDelta.multiplyQuaternions(rotQuat, this.quaternionDelta);
                            
                            // Aggiorna il vettore di partenza per il prossimo frame
                            this.dragStartVector.copy(targetPoint);
                        }
                    } else {
                        // Il cursore è uscito dal globo, ferma il tracking
                        this.isDragTracking = false;
                    }
                } else {
                    // Sistema di drag classico (quando clicchi fuori dal globo)
                    this.rotateEnd.set(event.clientX, event.clientY);
                    this.rotateDelta.subVectors(this.rotateEnd, this.rotateStart);
                    
                    // Converti il movimento del mouse in rotazione
                    const rotateSpeed = 0.002; // Ridotto da 0.005
                    
                    // Rotazione orizzontale (attorno all'asse Y locale)
                    const thetaDelta = -this.rotateDelta.x * rotateSpeed;
                    const quatY = new THREE.Quaternion().setFromAxisAngle(
                        new THREE.Vector3(0, 1, 0),
                        thetaDelta
                    );
                    
                    // Rotazione verticale (attorno all'asse X locale)
                    const phiDelta = -this.rotateDelta.y * rotateSpeed;
                    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quaternion);
                    const quatX = new THREE.Quaternion().setFromAxisAngle(right, phiDelta);
                    
                    // Combina le rotazioni
                    this.quaternionDelta.multiplyQuaternions(quatX, this.quaternionDelta);
                    this.quaternionDelta.multiplyQuaternions(quatY, this.quaternionDelta);
                    
                    this.rotateStart.copy(this.rotateEnd);
                }
                
                disableAutoRotate();
                scheduleAutoRotateResume();
            }
        },
        
        onMouseUp: function() {
            if (!this.enabled) return;
            
            document.removeEventListener('mousemove', this.onMouseMove);
            document.removeEventListener('mouseup', this.onMouseUp);
            
            this.currentState = this.state.NONE;
            this.isDragTracking = false; // Reset il tracking
            
            isDraggingRef.current = false;
            setCanvasCursor('grab');
        },
        
        onWheel: function(event) {
            if (!this.enabled) return;
            event.preventDefault();
            setCanvasCursor('grab');
            
            const absX = Math.abs(event.deltaX || 0);
            const absY = Math.abs(event.deltaY || 0);
            
            // Heuristics per distinguere pinch zoom da scroll normale
            const isPinch = !!(event.ctrlKey || event.metaKey);
            const isMouseWheel = !isPinch && absX < 1 && (event.deltaMode === 1 || absY >= 40);
            
            // Zoom factors
            const basePinch = 0.992;
            const baseWheel = 0.985;
            const base = isPinch ? basePinch : baseWheel;
            
            // Rotazione sensitivity basata sulla distanza
            const zoomT = (this.radius - this.minDistance) / (this.maxDistance - this.minDistance || 1);
            const k = (0.004 * Math.max(0.15, Math.min(1, zoomT))) * 0.30;
            
            if (isPinch || isMouseWheel) {
                if (!this.enableZoom) return;
                // Zoom in/out
                if (event.deltaY > 0) {
                    this.scale /= base;
                } else if (event.deltaY < 0) {
                    this.scale *= base;
                }
                disableAutoRotate();
                scheduleAutoRotateResume();
            } else {
                // Rotazione 2D trackpad
                const dx = (event.deltaX || 0);
                const dy = (event.deltaY || 0);
                
                // Rotazione orizzontale
                const thetaDelta = dx * k;
                const quatY = new THREE.Quaternion().setFromAxisAngle(
                    new THREE.Vector3(0, 1, 0),
                    thetaDelta
                );
                
                // Rotazione verticale
                const phiDelta = dy * k;
                const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quaternion);
                const quatX = new THREE.Quaternion().setFromAxisAngle(right, phiDelta);
                
                // Combina le rotazioni
                this.quaternionDelta.multiplyQuaternions(quatX, this.quaternionDelta);
                this.quaternionDelta.multiplyQuaternions(quatY, this.quaternionDelta);
                
                disableAutoRotate();
                scheduleAutoRotateResume();
            }
        },
        
        onTouchStart: function(event) {
            if (!this.enabled) return;
            if (event.touches.length === 1) {
                this.currentState = this.state.ROTATE;
                this.rotateStart.set(event.touches[0].pageX, event.touches[0].pageY);
            }
        },
        
        onTouchMove: function(event) {
            if (!this.enabled) return;
            event.preventDefault();
            
            if (event.touches.length === 1 && this.currentState === this.state.ROTATE) {
                this.rotateEnd.set(event.touches[0].pageX, event.touches[0].pageY);
                this.rotateDelta.subVectors(this.rotateEnd, this.rotateStart);
                
                const rotateSpeed = 0.002; // Ridotto per touch
                
                // Rotazione orizzontale
                const thetaDelta = -this.rotateDelta.x * rotateSpeed;
                const quatY = new THREE.Quaternion().setFromAxisAngle(
                    new THREE.Vector3(0, 1, 0),
                    thetaDelta
                );
                
                // Rotazione verticale
                const phiDelta = -this.rotateDelta.y * rotateSpeed;
                const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quaternion);
                const quatX = new THREE.Quaternion().setFromAxisAngle(right, phiDelta);
                
                // Combina le rotazioni
                this.quaternionDelta.multiplyQuaternions(quatX, this.quaternionDelta);
                this.quaternionDelta.multiplyQuaternions(quatY, this.quaternionDelta);
                
                this.rotateStart.copy(this.rotateEnd);
                disableAutoRotate();
                scheduleAutoRotateResume();
            }
        },
        
        onTouchEnd: function() {
            this.currentState = this.state.NONE;
        },
        
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
        
        dispose: function() {
            domElement.removeEventListener('mousedown', this.onMouseDown);
            domElement.removeEventListener('wheel', this.onWheel);
            domElement.removeEventListener('touchstart', this.onTouchStart);
            domElement.removeEventListener('touchmove', this.onTouchMove);
            domElement.removeEventListener('touchend', this.onTouchEnd);
            
            document.removeEventListener('mousemove', this.onMouseMove);
            document.removeEventListener('mouseup', this.onMouseUp);
        },
        
        // Metodo per impostare la posizione iniziale dalla posizione della camera
        setFromCamera: function(position) {
            // Calcola il quaternione dalla posizione della camera
            const forward = position.clone().normalize().negate();
            const up = new THREE.Vector3(0, 1, 0);
            const right = new THREE.Vector3().crossVectors(up, forward).normalize();
            up.crossVectors(forward, right);
            
            const matrix = new THREE.Matrix4();
            matrix.makeBasis(right, up, forward);
            this.quaternion.setFromRotationMatrix(matrix);
            
            this.radius = position.length();
        },
        
        // Metodo per convertire da coordinate sferiche (per compatibilità con animazioni esistenti)
        setFromSpherical: function(spherical) {
            const position = new THREE.Vector3().setFromSpherical(spherical);
            this.setFromCamera(position);
        },
        
        // Metodo per ottenere coordinate sferiche (per compatibilità)
        getSpherical: function() {
            const spherical = new THREE.Spherical();
            const position = new THREE.Vector3(0, 0, this.radius);
            position.applyQuaternion(this.quaternion);
            spherical.setFromVector3(position);
            return spherical;
        }
    };
    
    // Inizializza dalla posizione corrente della camera
    controls.setFromCamera(camera.position);
    controls.bindEventHandlers();
    
    return controls;
};