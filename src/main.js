import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls';

// Scene setup
const scene = new THREE.Scene();
let isIsometric = false;
let camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(10, 10, 10);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Controls
let controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const transformControls = new TransformControls(camera, renderer.domElement);
scene.add(transformControls);

transformControls.addEventListener('dragging-changed', function (event) {
  controls.enabled = !event.value;
});

// Grid and Helpers
const gridHelper = new THREE.GridHelper(100, 100);
gridHelper.position.y = 0.5;
gridHelper.position.z = 0.5;
gridHelper.position.x = 0.5;
gridHelper.frustumCulled = false;
scene.add(gridHelper);

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Block storage
const blocks = [];
let blockSize = 1;
let selectedBlock = null;
let currentMode = 'place'; // or 'select'

const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5);
const planeHelper = new THREE.PlaneHelper(groundPlane, 100, 0xffff00);
planeHelper.visible = false;
scene.add(planeHelper);

// Material Settings
let currentColor = '#00ff00';
let currentMaterialType = 'MeshStandardMaterial';

function getMaterial(opacity = 1, transparent = false) {
  const materialParams = {
    color: currentColor,
    opacity,
    transparent
  };
  return new THREE[currentMaterialType](materialParams);
}

const selectedMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 20, 10);
scene.add(directionalLight);

// Ghost Block
let ghostBlock = null;
function createGhostBlock() {
  if (ghostBlock) scene.remove(ghostBlock);
  ghostBlock = new THREE.Group();
  for (let x = 0; x < blockSize; x++) {
    for (let y = 0; y < blockSize; y++) {
      for (let z = 0; z < blockSize; z++) {
        const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), getMaterial(0.4, true));
        cube.position.set(x, y, z);
        ghostBlock.add(cube);
      }
    }
  }
  ghostBlock.visible = false;
  scene.add(ghostBlock);
}
createGhostBlock();

// Functions
function snapToGrid(position) {
  return Math.round(position);
}

function isOverlapping(pos) {
  return blocks.some(block =>
    block.position.distanceToSquared(pos) < 0.01
  );
}

function placeBlock(intersect) {
  let basePos = new THREE.Vector3();

  if (intersect.face && intersect.object) {
    basePos.copy(intersect.object.position);
    basePos.addScaledVector(intersect.face.normal, 1);
  } else {
    raycaster.ray.intersectPlane(groundPlane, basePos);
    basePos.y = 0.5;
  }

  basePos.x = snapToGrid(basePos.x);
  basePos.y = snapToGrid(basePos.y);
  basePos.z = snapToGrid(basePos.z);

  for (let x = 0; x < blockSize; x++) {
    for (let y = 0; y < blockSize; y++) {
      for (let z = 0; z < blockSize; z++) {
        const pos = new THREE.Vector3(basePos.x + x, basePos.y + y, basePos.z + z);
        if (isOverlapping(pos)) continue;
        const block = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), getMaterial());
        block.position.copy(pos);
        block.userData.originalMaterial = block.material;
        scene.add(block);
        blocks.push(block);
      }
    }
  }
}

function updateGhostBlock(intersect) {
  let basePos = new THREE.Vector3();

  if (intersect.face && intersect.object) {
    basePos.copy(intersect.object.position);
    basePos.addScaledVector(intersect.face.normal, 1);
  } else {
    raycaster.ray.intersectPlane(groundPlane, basePos);
    basePos.y = 0.5;
  }

  basePos.x = snapToGrid(basePos.x);
  basePos.y = snapToGrid(basePos.y);
  basePos.z = snapToGrid(basePos.z);

  ghostBlock.position.set(basePos.x, basePos.y, basePos.z);
  ghostBlock.visible = true;
}

function selectBlock(object) {
  if (selectedBlock) {
    selectedBlock.material = selectedBlock.userData.originalMaterial;
    transformControls.detach();
  }
  selectedBlock = object;
  if (selectedBlock) {
    selectedBlock.material = selectedMaterial;
    transformControls.attach(selectedBlock);
  }
}

function deleteSelectedBlock() {
  if (selectedBlock) {
    scene.remove(selectedBlock);
    transformControls.detach();
    const index = blocks.indexOf(selectedBlock);
    if (index !== -1) blocks.splice(index, 1);
    selectedBlock = null;
  }
}

function moveSelectedBlock(axis, direction) {
  if (selectedBlock) {
    const pos = selectedBlock.position.clone();
    pos[axis] = snapToGrid(pos[axis] + direction);
    if (!isOverlapping(pos)) selectedBlock.position.copy(pos);
  }
}

function moveBlockRelativeToCamera(key) {
  if (!selectedBlock) return;
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  camDir.y = 0;
  camDir.normalize();

  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), camDir).normalize();
  const forward = camDir.clone();

  let move = new THREE.Vector3();

  switch (key) {
    case 'q': // left and away
      move.add(right.clone().multiplyScalar(-1)).add(forward.clone());
      break;
    case 'a': // left and toward
      move.add(right.clone().multiplyScalar(-1)).add(forward.clone().multiplyScalar(-1));
      break;
    case 'e': // right and away
      move.add(right.clone()).add(forward.clone());
      break;
    case 'd': // right and toward
      move.add(right.clone()).add(forward.clone().multiplyScalar(-1));
      break;
  }

  move.normalize();

  const newPos = selectedBlock.position.clone().add(move);
  newPos.x = snapToGrid(newPos.x);
  newPos.z = snapToGrid(newPos.z);

  if (!isOverlapping(newPos)) selectedBlock.position.set(newPos.x, selectedBlock.position.y, newPos.z);
}

// Tool mode toggle UI
const menu = document.createElement('div');
menu.style.position = 'absolute';
menu.style.top = '10px';
menu.style.left = '10px';
menu.style.background = '#fff';
menu.style.padding = '5px';
menu.innerHTML = `
  <button id="placeTool">Place Tool</button>
  <button id="selectTool">Select Tool</button>
  <select id="blockSizeSelector">
    <option value="1">1x1x1</option>
    <option value="2">2x2x2</option>
    <option value="3">3x3x3</option>
  </select>
  <input type="color" id="colorPicker" value="#00ff00">
  <select id="materialSelector">
    <option value="MeshStandardMaterial">Standard</option>
    <option value="MeshBasicMaterial">Basic</option>
    <option value="MeshLambertMaterial">Lambert</option>
    <option value="MeshPhongMaterial">Phong</option>
  </select>
  <button id="isometricCamera">Toggle Isometric</button>
`;
document.body.appendChild(menu);

// UI Event Listeners

document.getElementById('placeTool').addEventListener('click', () => {
  currentMode = 'place';
  transformControls.detach();
  if (selectedBlock) {
    selectedBlock.material = selectedBlock.userData.originalMaterial;
    selectedBlock = null;
  }
});

document.getElementById('selectTool').addEventListener('click', () => {
  currentMode = 'select';
  ghostBlock.visible = false;
});

document.getElementById('blockSizeSelector').addEventListener('change', (event) => {
  blockSize = parseInt(event.target.value);
  createGhostBlock();
});

document.getElementById('colorPicker').addEventListener('input', (e) => {
  currentColor = e.target.value;
  createGhostBlock();
});

document.getElementById('materialSelector').addEventListener('change', (e) => {
  currentMaterialType = e.target.value;
  createGhostBlock();
});

document.getElementById('isometricCamera').addEventListener('click', () => {
  isIsometric = !isIsometric;
  if (isIsometric) {
    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.OrthographicCamera(-10 * aspect, 10 * aspect, 10, -10, 0.1, 1000);
    camera.position.set(10, 10, 10);
    camera.lookAt(0, 0, 0);
  } else {
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(10, 10, 10);
    camera.lookAt(0, 0, 0);
  }
  controls.dispose();
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  transformControls.camera = camera;
});

let mouseMoved = false;

renderer.domElement.addEventListener('mousedown', () => {
  mouseMoved = false;
});

renderer.domElement.addEventListener('mousemove', (event) => {
  mouseMoved = true;
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects([...blocks, gridHelper], false);
  if (currentMode === 'place' && intersects.length > 0) {
    updateGhostBlock(intersects[0]);
  } else {
    ghostBlock.visible = false;
  }
});

window.addEventListener('click', (event) => {
  if (mouseMoved) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects([...blocks, gridHelper], false);

  if (intersects.length > 0) {
    const hit = intersects[0];
    if (currentMode === 'select') {
      if (blocks.includes(hit.object)) {
        selectBlock(hit.object);
      }
    } else {
      placeBlock(hit);
    }
  } else {
    const dummyIntersect = { face: null };
    if (currentMode === 'place') {
      placeBlock(dummyIntersect);
    }
  }
});

window.addEventListener('keydown', (event) => {
  if (!selectedBlock) return;
  switch (event.key) {
    case 'Delete':
      deleteSelectedBlock();
      break;
    case 'w':
      moveSelectedBlock('y', 1);
      break;
    case 's':
      moveSelectedBlock('y', -1);
      break;
    case 'q':
    case 'a':
    case 'e':
    case 'd':
      moveBlockRelativeToCamera(event.key);
      break;
  }
});

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();

// Resize handler
window.addEventListener('resize', () => {
  if (isIsometric) {
    const aspect = window.innerWidth / window.innerHeight;
    camera.left = -10 * aspect;
    camera.right = 10 * aspect;
    camera.top = 10;
    camera.bottom = -10;
  } else {
    camera.aspect = window.innerWidth / window.innerHeight;
  }
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
