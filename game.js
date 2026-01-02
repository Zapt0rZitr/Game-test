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

export function startGame(state) {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas || gameData.scene) return;

    const ws = new WebSocket(`wss://${window.location.host}/ws`);
    gameData.ws = ws;

    ws.onopen = () => {
        ws.send(JSON.stringify({
            type: 'joinLobby',
            playerId: state.currentPlayer.id,
            lobbyId: state.currentLobby.id
        }));
    };

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617);

    const camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);

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

    const nameLabel = createLabel(state.currentPlayer.name);
    nameLabel.position.set(0, 2.2, 0);
    localGroup.add(nameLabel);

    scene.add(localGroup);

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

        const speed = 0.1;
        const move = new THREE.Vector3();

        if (keys.KeyW) move.z -= 1;
        if (keys.KeyS) move.z += 1;
        if (keys.KeyA) move.x -= 1;
        if (keys.KeyD) move.x += 1;

        move.normalize()
            .applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
            .multiplyScalar(speed);

        localGroup.position.add(move);
        localGroup.rotation.y = yaw;

        camera.position.set(
            localGroup.position.x,
            localGroup.position.y + 1.6,
            localGroup.position.z
        );

        camera.lookAt(
            localGroup.position.x + Math.sin(yaw) * Math.cos(pitch),
            localGroup.position.y + 1.6 + Math.sin(pitch),
            localGroup.position.z + Math.cos(yaw) * Math.cos(pitch)
        );

        renderer.render(scene, camera);
    }

    animate();
}

export function stopGame() {
    if (gameData.animationId) cancelAnimationFrame(gameData.animationId);
    if (gameData.ws) gameData.ws.close();
    gameData = {
        ws: null,
        scene: null,
        camera: null,
        renderer: null,
        localGroup: null,
        remoteMeshes: new Map(),
        animationId: null
    };
}

function createLabel(name) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const fontSize = 28;
    ctx.font = `${fontSize}px Inter`;
    const width = ctx.measureText(name).width;

    canvas.width = width + 16;
    canvas.height = fontSize + 16;

    ctx.font = `${fontSize}px Inter`;
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);

    sprite.scale.set(canvas.width / 140, canvas.height / 140, 1);
    return sprite;
}
