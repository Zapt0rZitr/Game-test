import * as THREE from 'three';

export let gameData = { ws: null, scene: null, camera: null, renderer: null, localGroup: null, remoteMeshes: new Map(), animationId: null };

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
        if (msg.type === 'gameState') {
            state.remotePlayers = msg.players;
        } else if (msg.type === 'playerJoined') {
            state.remotePlayers.push(msg.payload);
        } else if (msg.type === 'playerLeft') {
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

    const localGroup = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.8, 0.8), new THREE.MeshStandardMaterial({ color: 0x3b82f6 }));
    mesh.position.y = 0.9;
    localGroup.add(mesh);
    scene.add(localGroup);

    const localLabel = createLabel(state.currentPlayer.name);
    localLabel.position.set(0, 2.2, 0);
    localGroup.add(localLabel);

    gameData = { ...gameData, scene, camera, renderer, localGroup };

    let yaw = 0, pitch = 0;
    const keys = {};
    window.onkeydown = e => keys[e.code] = true;
    window.onkeyup = e => keys[e.code] = false;
    canvas.onclick = () => canvas.requestPointerLock();
    window.onmousemove = e => {
        if (document.pointerLockElement === canvas) {
            yaw -= e.movementX * 0.002;
            pitch -= e.movementY * 0.002;
            pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
        }
    };

    function animate() {
        gameData.animationId = requestAnimationFrame(animate);

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
            localGroup.position.x + Math.sin(yaw) * Math.cos(pitch),
            localGroup.position.y + 1.6 + Math.sin(pitch),
            localGroup.position.z + Math.cos(yaw) * Math.cos(pitch)
        );
        camera.lookAt(target);

        if(ws.readyState === WebSocket.OPEN){
            ws.send(JSON.stringify({
                type:'update',
                position: {x:localGroup.position.x, y:localGroup.position.y, z:localGroup.position.z},
                rotation: {x:pitch, y:yaw, z:0}
            }));
        }

        state.remotePlayers.forEach(p=>{
            if(p.id===state.currentPlayer.id) return;
            let obj = gameData.remoteMeshes.get(p.id);
            if(!obj){
                const remoteMesh = new THREE.Mesh(new THREE.BoxGeometry(0.8,1.8,0.8), new THREE.MeshStandardMaterial({color:0xef4444}));
                const label = createLabel(p.name);
                label.position.set(0,2.2,0);
                scene.add(remoteMesh);
                scene.add(label);
                obj = {mesh:remoteMesh,label};
                gameData.remoteMeshes.set(p.id,obj);
            }
            obj.mesh.position.set(p.position.x, p.position.y+0.9, p.position.z);
            obj.mesh.rotation.y = p.rotation.y;
            obj.label.position.set(p.position.x, p.position.y+2.2, p.position.z);
        });

        renderer.render(scene,camera);
    }
    animate();
}

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
    const material = new THREE.SpriteMaterial({map:texture,depthTest:false});
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(canvas.width/140, canvas.height/140, 1);
    return sprite;
}
