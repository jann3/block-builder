import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd111e);
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

let transformControls = new TransformControls(camera, renderer.domElement);
scene.add(transformControls);

transformControls.addEventListener('dragging-changed', function (event) {
  controls.enabled = !event.value;
});

transformControls.addEventListener('objectChange', () => {
  selectedBlocks.forEach(block => {
    if (block.position.y < 1.0) {
      block.position.y = 1.0;
    }
  });
});

// Grid and Helpers
const gridHelper = new THREE.GridHelper(100, 100, 0x666688, 0x444466);
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
let selectedBlocks = [];
let currentMode = 'place'; // or 'select'

const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5);
const planeHelper = new THREE.PlaneHelper(groundPlane, 100, 0xffff00);
planeHelper.visible = false;
scene.add(planeHelper);

// Material Settings
let currentColor = '#c6a6c9';
let currentMaterialType = 'MeshStandardMaterial';

function getMaterial(opacity = 1, transparent = false) {
  const materialParams = {
    color: currentColor,
    opacity,
    transparent
  };
  return new THREE[currentMaterialType](materialParams);
}

const selectedMaterial = new THREE.MeshStandardMaterial({ color: 0xc92169 });

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
  ghostBlock = new THREE.Mesh(
    new THREE.BoxGeometry(blockSize, blockSize, blockSize),
    getMaterial(0.4, true)
  );
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

  ghostBlock.geometry.dispose();
  ghostBlock.geometry = new THREE.BoxGeometry(blockSize, blockSize, blockSize);
  ghostBlock.position.set(
    basePos.x + (blockSize - 1) / 2,
    basePos.y + (blockSize - 1) / 2,
    basePos.z + (blockSize - 1) / 2
  );
  ghostBlock.visible = true;
}

function selectBlock(object, additive = false) {
  if (!additive) {
    selectedBlocks.forEach(b => b.material = b.userData.originalMaterial);
    selectedBlocks = [];
    transformControls.detach();
  }

  if (!selectedBlocks.includes(object)) {
    selectedBlocks.push(object);
    object.material = selectedMaterial;
  }

  if (selectedBlocks.length === 1) {
    transformControls.attach(selectedBlocks[0]);
  }
}

function deleteSelectedBlock() {
  selectedBlocks.forEach(block => {
    scene.remove(block);
    const index = blocks.indexOf(block);
    if (index !== -1) blocks.splice(index, 1);
  });
  transformControls.detach();
  selectedBlocks = [];
}

function moveSelectedBlock(axis, direction) {
  selectedBlocks.forEach(block => {
    const pos = block.position.clone();
    pos[axis] = snapToGrid(pos[axis] + direction);
    if (axis === 'y' && pos.y < 1.0) pos.y = 1.0;
    if (!isOverlapping(pos)) block.position.copy(pos);
  });
}

function moveBlockRelativeToCamera(key) {
  if (selectedBlocks.length === 0) return;
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  camDir.y = 0;
  camDir.normalize();

  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), camDir).normalize();
  const forward = camDir.clone();

  let move = new THREE.Vector3();

  switch (key) {
    case 'q': move.add(right.clone()).add(forward.clone()); break;
    case 'a': move.add(right.clone()).add(forward.clone().multiplyScalar(-1)); break;
    case 'e': move.add(right.clone().multiplyScalar(-1)).add(forward.clone()); break;
    case 'd': move.add(right.clone().multiplyScalar(-1)).add(forward.clone().multiplyScalar(-1)); break;
  }

  move.normalize();

  selectedBlocks.forEach(block => {
    const newPos = block.position.clone().add(move);
    newPos.x = snapToGrid(newPos.x);
    newPos.z = snapToGrid(newPos.z);
    if (!isOverlapping(newPos)) block.position.set(newPos.x, block.position.y, newPos.z);
  });
}

function exportOptimisedOBJ() {
  const voxelSize = 1;
  const grid = new Map();

  // Build voxel occupancy grid
  blocks.forEach(block => {
    const key = `${block.position.x},${block.position.y},${block.position.z}`;
    grid.set(key, true);
  });

  // Bounding box for the scene
  const bounds = blocks.reduce((acc, block) => {
    const { x, y, z } = block.position;
    acc.min.x = Math.min(acc.min.x, x);
    acc.min.y = Math.min(acc.min.y, y);
    acc.min.z = Math.min(acc.min.z, z);
    acc.max.x = Math.max(acc.max.x, x);
    acc.max.y = Math.max(acc.max.y, y);
    acc.max.z = Math.max(acc.max.z, z);
    return acc;
  }, {
    min: { x: Infinity, y: Infinity, z: Infinity },
    max: { x: -Infinity, y: -Infinity, z: -Infinity }
  });

  function isSolid(x, y, z) {
    return grid.has(`${x},${y},${z}`);
  }

  const vertices = [];
  const faces = [];
  const vertexMap = new Map();
  let vertexCount = 1;

  // Helper to add a vertex and return its index
  function addVertex(v) {
    const key = v.join(',');
    if (!vertexMap.has(key)) {
      vertexMap.set(key, vertexCount++);
      vertices.push(`v ${v[0]} ${v[1]} ${v[2]}`);
    }
    return vertexMap.get(key);
  }

  // Face directions
  const dirs = [
    { d: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
    { d: [-1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
    { d: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { d: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { d: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { d: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0] }
  ];

  // Iterate through every voxel face
  for (let x = bounds.min.x; x <= bounds.max.x; x++) {
    for (let y = bounds.min.y; y <= bounds.max.y; y++) {
      for (let z = bounds.min.z; z <= bounds.max.z; z++) {
        if (!isSolid(x, y, z)) continue;

        for (let i = 0; i < dirs.length; i++) {
          const { d, u, v } = dirs[i];
          const nx = x + d[0], ny = y + d[1], nz = z + d[2];
          if (isSolid(nx, ny, nz)) continue; // skip internal face

          // Create quad face
          const base = [x, y, z];
          const corners = [
            [0, 0], [1, 0], [1, 1], [0, 1]
          ].map(([a, b]) =>
            base.map((c, idx) =>
              c + d[idx] * 0.5 +
              u[idx] * (a - 0.5) +
              v[idx] * (b - 0.5)
            )
          );

          const indices = corners.map(addVertex);
          faces.push(`f ${indices[0]} ${indices[1]} ${indices[2]} ${indices[3]}`);
        }
      }
    }
  }

  const output = [...vertices, ...faces].join('\n');
  const blob = new Blob([output], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'optimised_model.obj';
  a.click();
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
  <input type="color" id="colorPicker" value="#c6a6c9">
  <select id="materialSelector">
    <option value="MeshStandardMaterial">Standard</option>
    <option value="MeshBasicMaterial">Basic</option>
    <option value="MeshLambertMaterial">Lambert</option>
    <option value="MeshPhongMaterial">Phong</option>
  </select>
  <button id="isometricCamera">Toggle Isometric</button>
  <button id="exportFullObj">Export OBJ</button>
  <button id="exportOptObj">Export optmized OBJ</button>
`;
document.body.appendChild(menu);

// UI Event Listeners

document.getElementById('placeTool').addEventListener('click', () => {
  currentMode = 'place';
  transformControls.detach();
  selectedBlocks.forEach(b => b.material = b.userData.originalMaterial);
  selectedBlocks = [];
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

document.getElementById('exportFullObj').addEventListener('click', () => {
  exportBlocksAsOBJ();
});

document.getElementById('exportOptObj').addEventListener('click', () => {
  exportOptimisedOBJ();
});

document.getElementById('isometricCamera').addEventListener('click', () => {
  isIsometric = !isIsometric;
  const aspect = window.innerWidth / window.innerHeight;
  if (isIsometric) {
    camera = new THREE.OrthographicCamera(-10 * aspect, 10 * aspect, 10, -10, 0.1, 1000);
    camera.position.set(10, 10, 10);
    camera.lookAt(0, 0, 0);
  } else {
    camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
    camera.position.set(10, 10, 10);
    camera.lookAt(0, 0, 0);
  }
  controls.dispose();
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  scene.remove(transformControls);
  transformControls = new TransformControls(camera, renderer.domElement);
  transformControls.addEventListener('dragging-changed', function (event) {
    controls.enabled = !event.value;
  });
  scene.add(transformControls);

  if (selectedBlocks.length === 1) {
    transformControls.attach(selectedBlocks[0]);
  }
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
        selectBlock(hit.object, event.shiftKey);
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
  if (selectedBlocks.length === 0) return;
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
  const aspect = window.innerWidth / window.innerHeight;
  if (isIsometric) {
    camera.left = -10 * aspect;
    camera.right = 10 * aspect;
    camera.top = 10;
    camera.bottom = -10;
  } else {
    camera.aspect = aspect;
  }
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
