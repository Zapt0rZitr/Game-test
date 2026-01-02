import * as THREE from 'three';

let gameData = {
  scene: null,
  camera: null,
  renderer: null,
  ws: null,
  animationId: null,
  remoteMeshes: new Map()
};

export function startGame({ state, WS_BASE, onRemotePlayersUpdate }) {
  const canvas = document.getElementById('gameCanvas');
  if (!canvas || gameData.scene) return;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020617);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);

  scene.add(new THREE.GridHelper(100, 100));
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));

  const player = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.8, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x3b82f6 })
  );
  body.position.y = 0.9;
  player.add(body);
  scene.add(player);

  const ws = new WebSocket(`${WS_BASE}/ws`);
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'gameState') {
      onRemotePlayersUpdate(msg.players);
    }
  };

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

    const dir = new THREE.Vector3();
    if (keys.KeyW) dir.z -= 1;
    if (keys.KeyS) dir.z += 1;
    if (keys.KeyA) dir.x -= 1;
    if (keys.KeyD) dir.x += 1;

    dir.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    player.position.add(dir.multiplyScalar(0.1));

    camera.position.set(
      player.position.x,
      player.position.y + 1.6,
      player.position.z
    );

    camera.lookAt(
      player.position.x + Math.sin(yaw),
      player.position.y + 1.6 + Math.sin(pitch),
      player.position.z + Math.cos(yaw)
    );

    renderer.render(scene, camera);
  }

  animate();

  gameData = { scene, camera, renderer, ws };
}

export function stopGame() {
  if (gameData.animationId) cancelAnimationFrame(gameData.animationId);
  if (gameData.ws) gameData.ws.close();
  gameData = { scene: null, camera: null, renderer: null, ws: null, animationId: null, remoteMeshes: new Map() };
}
