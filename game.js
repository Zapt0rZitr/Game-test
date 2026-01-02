import * as THREE from 'three';

let gameData = {
    ws: null,
    scene: null,
    camera: null,
    renderer: null,
    localGroup: null,
    remoteMeshes: new Map(),
    animationId: null
};

export function startGame({ canvasId, wsBase, state }) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || gameData.scene) return;

    const ws = new WebSocket(`${wsBase}/ws`);
    gameData.ws = ws;

    ws.onopen = () => {
        ws.send(JSON.stringify({
            type: 'joinLobby',
            playerId: state.currentPlayer.id,
            lobbyId: state.currentLobby.id
        }));
    };

    ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'gameState') state.remotePlayers = msg.players;
        if (msg.type === 'playerJoined') state.remotePlayers.push(msg.payload);
        if (msg.type === 'playerLeft') {
            state.remotePlayers = state.remotePlayers.filter(p => p.id !== msg.payload.id);
            const obj = gameData.remoteMeshes.get(msg.payload.id);
            if (obj) {
                gameData.scene.remove(obj.mesh, obj.label);
                gameData.remoteMeshes.delete(msg.payload.id);
            }
        }
        if (msg.type === 'playerUpdate') {
            const p = state.remotePlayers.find(pl => pl.id === msg.player.id);
            if (p) Object.assign(p, msg.player);
        }
        window.updatePlayerCount?.();
    };

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617);

    const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(innerWidth, innerHeight);

    scene.add(new THREE.GridHelper(100, 100));
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5, 10, 7.5);
    scene.add(light);

    const localGroup = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 1.8, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x3b82f6 })
    );
    body.position.y = 0.9;
    localGroup.add(body);
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
            pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch - e.movementY * 0.002));
        }
    };

    function animate() {
        gameData.animationId = requestAnimationFrame(animate);

        const dir = new THREE.Vector3(
            (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0),
            0,
            (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0)
        ).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

        localGroup.position.add(dir.multiplyScalar(0.1));
        localGroup.rotation.y = yaw;

        camera.position.set(
            localGroup.position.x,
            localGroup.position.y + 1.6,
            localGroup.position.z
        );

        camera.lookAt(
            localGroup.position.x + Math.sin(yaw),
            localGroup.position.y + 1.6 + Math.sin(pitch),
            localGroup.position.z + Math.cos(yaw)
        );

        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'update',
                position: localGroup.position,
                rotation: { x: pitch, y: yaw, z: 0 }
            }));
        }

        state.remotePlayers.forEach(p => {
            if (p.id === state.currentPlayer.id) return;
            let obj = gameData.remoteMeshes.get(p.id);
            if (!obj) {
                const mesh = body.clone();
                mesh.material = mesh.material.clone();
                mesh.material.color.set(0xef4444);
                const label = createLabel(p.name);
                scene.add(mesh, label);
                obj = { mesh, label };
                gameData.remoteMeshes.set(p.id, obj);
            }
            obj.mesh.position.set(p.position.x, p.position.y + 0.9, p.position.z);
            obj.label.position.set(p.position.x, p.position.y + 2.2, p.position.z);
        });

        renderer.render(scene, camera);
    }

    animate();
}

export function stopGame() {
    if (gameData.animationId) cancelAnimationFrame(gameData.animationId);
    if (gameData.ws) gameData.ws.close();
    gameData = { ws: null, scene: null, camera: null, renderer: null, localGroup: null, remoteMeshes: new Map(), animationId: null };
}

function createLabel(name) {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    ctx.font = '48px Inter';
    c.width = ctx.measureText(name).width + 20;
    c.height = 64;
    ctx.font = '48px Inter';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.fillText(name, c.width / 2, 48);
    const tex = new THREE.CanvasTexture(c);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
    sprite.scale.set(c.width / 140, c.height / 140, 1);
    return sprite;
}
