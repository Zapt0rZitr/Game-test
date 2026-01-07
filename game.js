import * as THREE from 'three';

export let gameData = { ws: null, scene: null, camera: null, renderer: null, localGroup: null, remoteMeshes: new Map(), animationId: null };

const FLOOR_SIZE = 200;
const WALL_COUNT = 40;

let darkMode = false;
let radar = null;
const RADAR_MAX_RADIUS = 6;
const RADAR_SPEED = 6; // units per second
const RADAR_HEIGHT = 5;
const revealedMeshes = new Set();

export function initThreeJS(state, WS_BASE) {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas || gameData.scene) return;

    const ws = new WebSocket(`${WS_BASE}/ws`);
    gameData.ws = ws;

    ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'joinLobby', playerId: state.currentPlayer.id, lobbyId: state.currentLobby.id }));
    };

    ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'gameState') state.remotePlayers = msg.players;
        else if (msg.type === 'playerJoined') state.remotePlayers.push(msg.payload);
        else if (msg.type === 'playerLeft') {
            state.remotePlayers = state.remotePlayers.filter(p => p.id !== msg.payload.id);
            const meshObj = gameData.remoteMeshes.get(msg.payload.id);
            if (meshObj) {
                gameData.scene.remove(meshObj.mesh);
                gameData.scene.remove(meshObj.label);
                gameData.remoteMeshes.delete(msg.payload.id);
            }
        } else if (msg.type === 'playerUpdate') {
            const p = state.remotePlayers.find(pl => pl.id === msg.player.id);
            if (p) Object.assign(p, msg.player);
            else state.remotePlayers.push(msg.player);
        }
    };

    // ===== SCENE / CAMERA / RENDERER =====
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617);
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);

    scene.add(new THREE.GridHelper(100, 100, 0x1e293b, 0x0f172a));
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5, 10, 7.5);
    scene.add(light);

    createEnvironment(scene);

    // ===== LOCAL PLAYER =====
    const localGroup = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.8, 0.8), new THREE.MeshStandardMaterial({ color: 0x3b82f6 }));
    mesh.position.y = 0.9;
    localGroup.add(mesh);
    scene.add(localGroup);

    const localLabel = createLabel(state.currentPlayer.name);
    localLabel.position.set(0, 2.2, 0);
    localGroup.add(localLabel);

    gameData = { ...gameData, scene, camera, renderer, localGroup };

    // ===== INPUTS =====
    let yaw = 0, pitch = 0;
    const keys = {};
    window.onkeydown = e => keys[e.code] = true;
    window.onkeyup = e => keys[e.code] = false;
    canvas.onclick = () => canvas.requestPointerLock();
    window.onmousemove = e => {
        if (document.pointerLockElement === canvas) {
            yaw -= e.movementX * 0.002;
            pitch -= e.movementY * 0.002;
            pitch = Math.max(-Math.PI/2, Math.min(Math.PI/2, pitch));
        }
    };
    window.onkeydown = (e) => {
        keys[e.code] = true;
        if (e.code === 'KeyO') toggleDarkMode(scene);
        if (e.code === 'KeyQ') triggerRadar(scene, localGroup.position);
    };

    // ===== ANIMATION LOOP =====
    let lastTime = performance.now();
    function animate(time = performance.now()) {
        const deltaTime = (time - lastTime)/1000;
        lastTime = time;
        gameData.animationId = requestAnimationFrame(animate);

        // ===== MOVEMENT =====
        const moveSpeed = 0.1;
        const dir = new THREE.Vector3();
        if (keys['KeyW']) dir.z += 1;
        if (keys['KeyS']) dir.z -= 1;
        if (keys['KeyA']) dir.x += 1;
        if (keys['KeyD']) dir.x -= 1;
        dir.normalize().applyAxisAngle(new THREE.Vector3(0,1,0), yaw).multiplyScalar(moveSpeed);
        localGroup.position.add(dir);
        localGroup.rotation.y = yaw;

        camera.position.set(localGroup.position.x, localGroup.position.y + 1.6, localGroup.position.z);
        const target = new THREE.Vector3(
            localGroup.position.x + Math.sin(yaw)*Math.cos(pitch),
            localGroup.position.y + 1.6 + Math.sin(pitch),
            localGroup.position.z + Math.cos(yaw)*Math.cos(pitch)
        );
        camera.lookAt(target);

        if(ws.readyState === WebSocket.OPEN){
            ws.send(JSON.stringify({
                type:'update',
                position:{x:localGroup.position.x, y:localGroup.position.y, z:localGroup.position.z},
                rotation:{x:pitch, y:yaw, z:0}
            }));
        }

        // ===== REMOTE PLAYERS =====
        state.remotePlayers.forEach(p => {
            if(p.id===state.currentPlayer.id) return;
            let obj = gameData.remoteMeshes.get(p.id);
            if(!obj){
                const remoteMesh = new THREE.Mesh(new THREE.BoxGeometry(0.8,1.8,0.8), new THREE.MeshStandardMaterial({color:0xef4444}));
                const label = createLabel(p.name);
                label.position.set(0,2.2,0);
                scene.add(remoteMesh);
                scene.add(label);
                obj = {mesh:remoteMesh, label};
                gameData.remoteMeshes.set(p.id,obj);
            }
            obj.mesh.position.set(p.position.x, p.position.y+0.9, p.position.z);
            obj.mesh.rotation.y = p.rotation.y;
            obj.label.position.set(p.position.x, p.position.y+2.2, p.position.z);
        });

        // ===== RADAR =====
        updateRadar(scene, deltaTime);

        renderer.render(scene, camera);
    }

    animate();
}

// ===== LABELS =====
function createLabel(name){
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font='48px Inter';
    const textWidth = ctx.measureText(name).width;
    canvas.width = textWidth+20;
    canvas.height = 64;
    ctx.font='48px Inter';
    ctx.fillStyle='white';
    ctx.textAlign='center';
    ctx.fillText(name,canvas.width/2,48);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({map:texture, depthTest:false});
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(canvas.width/140, canvas.height/140, 1);
    return sprite;
}

// ===== ENVIRONMENT =====
function createEnvironment(scene){
    // Floor
    const floorGeo = new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE);
    const floorMat = new THREE.MeshStandardMaterial({color:0x020617, roughness:0.9, metalness:0.05});
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI/2;
    floor.receiveShadow = true;
    scene.add(floor);
    scene.userData.floor = floor;

    // Walls
    const wallMat = new THREE.MeshStandardMaterial({color:0x334155, roughness:0.6});
    scene.userData.walls = [];
    for(let i=0;i<WALL_COUNT;i++){
        const width = THREE.MathUtils.randFloat(2,6);
        const height = THREE.MathUtils.randFloat(2,5);
        const depth = THREE.MathUtils.randFloat(2,6);
        const wallGeo = new THREE.BoxGeometry(width,height,depth);
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.position.set(
            THREE.MathUtils.randFloatSpread(FLOOR_SIZE*0.8),
            height/2,
            THREE.MathUtils.randFloatSpread(FLOOR_SIZE*0.8)
        );
        wall.castShadow = true;
        wall.receiveShadow = true;
        scene.add(wall);
        scene.userData.walls.push(wall);
    }
}

// ===== DARK MODE =====
function toggleDarkMode(scene){
    darkMode = !darkMode;
    scene.background.set(darkMode?0x000000:0x020617);
    scene.children.forEach(obj=>{
        if(obj.type==='GridHelper') obj.visible = !darkMode;
    });
    gameData.remoteMeshes.forEach(obj=>{
        obj.label.visible = !darkMode;
    });
    if(gameData.localGroup){
        gameData.localGroup.children.forEach(c=>{
            if(c.type==='Sprite') c.visible = !darkMode;
        });
    }
    const env = scene.userData;
    if(env.floor) env.floor.visible = !darkMode;
    env.walls?.forEach(w => w.visible = !darkMode);
}

// ===== RADAR =====
function triggerRadar(scene, position){
    if(radar) return;
    radar = {
        origin: position.clone(),
        radius: 0,
        ring: createRadarRing(scene)
    };
}

function createRadarRing(scene){
    const geo = new THREE.RingGeometry(0.95,1,64);
    const mat = new THREE.MeshBasicMaterial({color:0x38bdf8, transparent:true, opacity:0.9, side:THREE.DoubleSide});
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x=-Math.PI/2;
    ring.position.y=0.05;
    scene.add(ring);
    return ring;
}

function updateRadar(scene, deltaTime){
    if(!radar) return;
    radar.radius += RADAR_SPEED * deltaTime;
    radar.ring.scale.set(radar.radius, radar.radius, 1);
    radar.ring.position.copy(radar.origin);
    revealSurfaces(scene, radar);
    if(radar.radius >= RADAR_MAX_RADIUS){
        scene.remove(radar.ring);
        radar = null;
    }
}

function revealSurfaces(scene, radar){
    const objects = [scene.userData.floor, ...(scene.userData.walls || [])];
    const raycaster = new THREE.Raycaster();
    objects.forEach(obj=>{
        if(!obj || revealedMeshes.has(obj)) return;
        const box = new THREE.Box3().setFromObject(obj);
        const center = box.getCenter(new THREE.Vector3());
        const dx = center.x - radar.origin.x;
        const dz = center.z - radar.origin.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        if(dist>radar.radius) return;
        const dir = center.clone().sub(radar.origin).normalize();
        raycaster.set(radar.origin.clone().add(new THREE.Vector3(0,1.2,0)), dir);
        raycaster.far = dist+0.2;
        const hits = raycaster.intersectObjects(objects,true);
        if(hits.length && hits[0].object!==obj) return;
        applyGridReveal(obj, radar.origin, radar.radius);
        revealedMeshes.add(obj);
    });
}

function applyGridReveal(mesh, origin, radius){
    const gridMat = new THREE.MeshBasicMaterial({color:0x38bdf8, wireframe:true, transparent:true, opacity:0.7, depthWrite:false});
    const overlay = new THREE.Mesh(mesh.geometry.clone(), gridMat);
    overlay.position.copy(mesh.position);
    overlay.rotation.copy(mesh.rotation);
    overlay.scale.copy(mesh.scale);
    overlay.onBeforeRender = function(){
        overlay.material.clippingPlanes = [
            new THREE.Plane(new THREE.Vector3(1,0,0), -(origin.x+radius)),
            new THREE.Plane(new THREE.Vector3(-1,0,0), origin.x-radius),
            new THREE.Plane(new THREE.Vector3(0,0,1), -(origin.z+radius)),
            new THREE.Plane(new THREE.Vector3(0,0,-1), origin.z-radius)
        ];
        overlay.material.clipIntersection = true;
    };
    mesh.parent.add(overlay);
}
