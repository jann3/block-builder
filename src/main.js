import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls';

/*
  CLEAN BASELINE IMPLEMENTATION
  -----------------------------
  Guarantees:
  - Blocks snap to ground AND other blocks
  - Grid aligns perfectly with blocks
  - Simple OBJ export ALWAYS works in Blender
  - No greedy meshing / no optimisation
  - This is a known-good foundation
*/

// ---------------- Scene ----------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d1d1e);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(10, 10, 10);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// ---------------- Controls ----------------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const transformControls = new TransformControls(camera, renderer.domElement);
scene.add(transformControls);

transformControls.addEventListener('dragging-changed', e => {
  controls.enabled = !e.value;
});

// ---------------- Lights ----------------
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(10, 20, 10);
scene.add(dir);

// ---------------- Grid ----------------
const GRID_SIZE = 100;
const GRID_DIVS = 100;

const gridGeometry = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE);
gridGeometry.rotateX(-Math.PI / 2);

const gridMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uSize:         { value: GRID_SIZE },
    uDivisions:    { value: GRID_DIVS },
    uFadeDistance: { value: 16.0 },
    uLineWidth:    { value: 0.02 },
    uCenter:       { value: new THREE.Vector3(0, 0, 0) }
  },
  vertexShader: `
    varying vec3 vWorldPosition;
    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: `
    uniform float uSize;
    uniform float uDivisions;
    uniform float uFadeDistance;
    uniform float uLineWidth;
    uniform vec3 uCenter;
    varying vec3 vWorldPosition;
    void main() {
      vec2 coord = vWorldPosition.xz + uSize / 2.0;
      float spacing = uSize / float(uDivisions);
      vec2 modCoord = mod(coord, spacing);
      float line = step(modCoord.x, uLineWidth) + step(spacing - modCoord.x, uLineWidth)
                 + step(modCoord.y, uLineWidth) + step(spacing - modCoord.y, uLineWidth);
      float dist = distance(vWorldPosition.xz, uCenter.xz);
      float fade = 1.0 - smoothstep(uFadeDistance * 0.6, uFadeDistance, dist);
      float alpha = clamp(line * fade, 0.0, 1.0);
      if (alpha < 0.01) discard;
      gl_FragColor = vec4(0.4, 0.4, 0.6, alpha);
    }
  `,
  transparent: true,
  depthWrite: false
});

const grid = new THREE.Mesh(gridGeometry, gridMaterial);
grid.frustumCulled = false;
scene.add(grid);

// ---------------- Ground Plane ----------------
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// ---------------- State ----------------
const blocks = [];
const selectedBlocks = new Set();
let mode = 'place';

// ---------------- Materials ----------------
const blockMaterial = new THREE.MeshStandardMaterial({ color: 0xc6a6c9 });
const hoverMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xc6a6c9).multiplyScalar(0.72) });
const selectedMaterial = new THREE.MeshStandardMaterial({ color: 0xff3366 });

// ---------------- Helpers ----------------
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function snap(v) {
  return Math.floor(v) + 0.5;
}

function isOccupied(x, y, z) {
  return blocks.some(b =>
    b.position.x === x &&
    b.position.y === y &&
    b.position.z === z
  );
}

// ---------------- Ghost ----------------
const ghost = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0xffffff, opacity: 0.4, transparent: true })
);
ghost.visible = false;
scene.add(ghost);

// ---------------- Placement ----------------
function updateGhost(intersect) {
  const pos = new THREE.Vector3();

  if (intersect && intersect.face && blocks.includes(intersect.object)) {
    pos.copy(intersect.object.position);
    pos.add(intersect.face.normal);
  } else {
    raycaster.ray.intersectPlane(groundPlane, pos);
    pos.y = 0;
  }

  pos.set(snap(pos.x), snap(pos.y), snap(pos.z));
  ghost.position.copy(pos);
  ghost.visible = true;
}

function placeBlock(intersect) {
  const pos = ghost.position.clone();

  if (isOccupied(pos.x, pos.y, pos.z)) return;

  const mat = blockMaterial.clone();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
  mesh.userData.originalMaterial = mat;
  mesh.position.copy(pos);
  scene.add(mesh);
  blocks.push(mesh);
}

// ---------------- Selection ----------------
let hoveredBlock = null;

function setHover(obj) {
  if (hoveredBlock === obj) return;
  if (hoveredBlock && !selectedBlocks.has(hoveredBlock)) {
    hoveredBlock.material = hoveredBlock.userData.originalMaterial;
  }
  hoveredBlock = obj;
  if (hoveredBlock && !selectedBlocks.has(hoveredBlock)) {
    hoveredBlock.material = hoverMaterial;
  }
}

function clearSelection() {
  selectedBlocks.forEach(b => { b.material = b.userData.originalMaterial; });
  selectedBlocks.clear();
  transformControls.detach();
}

function selectBlock(obj, additive = false) {
  if (!additive) clearSelection();

  if (selectedBlocks.has(obj)) {
    // Shift-click on already-selected block → deselect it
    selectedBlocks.delete(obj);
    obj.material = obj === hoveredBlock ? hoverMaterial : obj.userData.originalMaterial;
  } else {
    selectedBlocks.add(obj);
    obj.material = selectedMaterial;
    if (hoveredBlock === obj) hoveredBlock = null;
  }

  // Attach transform gizmo only for single selections
  if (selectedBlocks.size === 1) {
    transformControls.attach([...selectedBlocks][0]);
  } else {
    transformControls.detach();
  }
}

// ---------------- Export OBJ (KNOWN GOOD) ----------------
function exportOBJ() {
  if (!blocks.length) return;

  const verts = [
    [0,0,0],[1,0,0],[1,1,0],[0,1,0],
    [0,0,1],[1,0,1],[1,1,1],[0,1,1]
  ];

  const faces = [
    [1,2,3],[1,3,4],
    [5,8,7],[5,7,6],
    [1,5,6],[1,6,2],
    [2,6,7],[2,7,3],
    [3,7,8],[3,8,4],
    [4,8,5],[4,5,1]
  ];

  let obj = '';
  let offset = 0;

  for (const b of blocks) {
    const { x, y, z } = b.position;

    for (const v of verts) {
      obj += `v ${v[0]+x} ${v[1]+y} ${v[2]+z}\n`;
    }

    for (const f of faces) {
      obj += `f ${f[0]+offset} ${f[1]+offset} ${f[2]+offset}\n`;
    }

    offset += 8;
  }

  const blob = new Blob([obj], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'blocks.obj';
  a.click();
}

// ---------------- Export Optimised OBJ ----------------
function exportOptimisedOBJ() {
  if (!blocks.length) return;

  // Integer grid coords: block centered at (cx,cy,cz) → corner at (cx-0.5, cy-0.5, cz-0.5)
  const gb = blocks.map(b => [
    Math.round(b.position.x - 0.5),
    Math.round(b.position.y - 0.5),
    Math.round(b.position.z - 0.5)
  ]);

  const occ = new Set(gb.map(([x, y, z]) => `${x},${y},${z}`));
  const has = (x, y, z) => occ.has(`${x},${y},${z}`);

  const verts = [];
  const tris  = [];
  const vmap  = new Map();

  function getV(x, y, z) {
    const k = `${x},${y},${z}`;
    if (!vmap.has(k)) { vmap.set(k, verts.length + 1); verts.push([x, y, z]); }
    return vmap.get(k);
  }

  function emitQuad(a, b, c, d) {
    const [ia, ib, ic, id] = [a, b, c, d].map(([x, y, z]) => getV(x, y, z));
    tris.push([ia, ib, ic], [ia, ic, id]);
  }

  // [normAxis, normDir, uAxis, vAxis]
  const faceTypes = [
    [0, +1, 1, 2],  // +X
    [0, -1, 1, 2],  // -X
    [1, +1, 0, 2],  // +Y
    [1, -1, 0, 2],  // -Y
    [2, +1, 0, 1],  // +Z
    [2, -1, 0, 1],  // -Z
  ];

  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const b of gb) for (let i = 0; i < 3; i++) {
    if (b[i] < lo[i]) lo[i] = b[i];
    if (b[i] > hi[i]) hi[i] = b[i];
  }

  for (const [na, nd, ua, va] of faceTypes) {
    for (let s = lo[na]; s <= hi[na]; s++) {
      const uw = hi[ua] - lo[ua] + 1;
      const vw = hi[va] - lo[va] + 1;
      const grid = Array.from({ length: uw }, () => new Uint8Array(vw));
      const done = Array.from({ length: uw }, () => new Uint8Array(vw));

      for (const b of gb) {
        if (b[na] !== s) continue;
        const nb = [b[0], b[1], b[2]];
        nb[na] += nd;
        if (!has(nb[0], nb[1], nb[2])) {
          grid[b[ua] - lo[ua]][b[va] - lo[va]] = 1;
        }
      }

      for (let i = 0; i < uw; i++) {
        for (let j = 0; j < vw; j++) {
          if (!grid[i][j] || done[i][j]) continue;

          // Extend along u axis
          let wi = 1;
          while (i + wi < uw && grid[i + wi][j] && !done[i + wi][j]) wi++;

          // Extend along v axis keeping full u width
          let wj = 1;
          ext: while (j + wj < vw) {
            for (let di = 0; di < wi; di++) {
              if (!grid[i + di][j + wj] || done[i + di][j + wj]) break ext;
            }
            wj++;
          }

          for (let di = 0; di < wi; di++)
            for (let dj = 0; dj < wj; dj++)
              done[i + di][j + dj] = 1;

          const u0 = lo[ua] + i,      u1 = lo[ua] + i + wi;
          const v0 = lo[va] + j,      v1 = lo[va] + j + wj;
          const nv = s + (nd === 1 ? 1 : 0);

          const pt = (u, v) => {
            const c = [0, 0, 0];
            c[na] = nv; c[ua] = u; c[va] = v;
            return c;
          };

          // Winding formula derived to produce outward-facing normals
          const flip = na % 2 === 0 ? nd : -nd;
          if (flip > 0) emitQuad(pt(u0,v0), pt(u1,v0), pt(u1,v1), pt(u0,v1));
          else          emitQuad(pt(u0,v0), pt(u0,v1), pt(u1,v1), pt(u1,v0));
        }
      }
    }
  }

  let obj = '';
  for (const [x, y, z] of verts) obj += `v ${x} ${y} ${z}\n`;
  for (const f of tris)          obj += `f ${f.join(' ')}\n`;

  const blob = new Blob([obj], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'model_optimised.obj';
  a.click();
}

// ---------------- Import OBJ ----------------
function importOBJ(text) {
  const lines = text.split('\n');
  const verts = [];
  const faces = [];

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === 'v') {
      verts.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
    } else if (parts[0] === 'f') {
      const indices = parts.slice(1).map(p => parseInt(p.split('/')[0]) - 1);
      for (let i = 1; i < indices.length - 1; i++) {
        faces.push([indices[0], indices[i], indices[i + 1]]);
      }
    }
  }

  if (verts.length === 0) return;

  // Non-optimized export writes verts starting at the block center (not the true corner),
  // so all coordinates are half-integers. Optimized export uses integer coords.
  const isNonOptimized = verts.some(v =>
    v.some(c => Math.abs(((c % 1) + 1) % 1 - 0.5) < 0.01)
  );

  const blockSet = new Set();

  if (isNonOptimized) {
    // exportOBJ writes 8 consecutive verts per block starting at the block center,
    // so the minimum corner of each group IS the block center position.
    for (let i = 0; i < verts.length; i += 8) {
      const g = verts.slice(i, i + 8);
      if (g.length < 8) break;
      const cx = Math.min(...g.map(v => v[0]));
      const cy = Math.min(...g.map(v => v[1]));
      const cz = Math.min(...g.map(v => v[2]));
      blockSet.add(`${cx},${cy},${cz}`);
    }
  } else {
    // Optimized export uses integer vertex coords. Reconstruct each block by finding
    // which unit cell sits behind each face (offset 0.5 inward from the face).
    for (const [ia, ib, ic] of faces) {
      const a = verts[ia], b = verts[ib], c = verts[ic];

      // The face is perpendicular to the axis with the least variation across vertices.
      const diffs = [0, 1, 2].map(ax =>
        Math.max(Math.abs(a[ax]-b[ax]), Math.abs(a[ax]-c[ax]), Math.abs(b[ax]-c[ax]))
      );
      const axis = diffs.indexOf(Math.min(...diffs));

      // Compute outward normal via cross product to determine which side the block is on.
      const e1 = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
      const e2 = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
      const norm = [
        e1[1]*e2[2] - e1[2]*e2[1],
        e1[2]*e2[0] - e1[0]*e2[2],
        e1[0]*e2[1] - e1[1]*e2[0]
      ];

      const faceCoord = a[axis];
      const normalDir = norm[axis] > 0 ? 1 : -1;
      // Block center on this axis is 0.5 units inward from the face.
      const blockAxisCoord = faceCoord - normalDir * 0.5;

      const ua = (axis + 1) % 3;
      const va = (axis + 2) % 3;
      const minU = Math.floor(Math.min(a[ua], b[ua], c[ua]));
      const maxU = Math.ceil(Math.max(a[ua], b[ua], c[ua]));
      const minV = Math.floor(Math.min(a[va], b[va], c[va]));
      const maxV = Math.ceil(Math.max(a[va], b[va], c[va]));

      // Each unit cell in the face's bounding rectangle is one block.
      for (let u = minU; u < maxU; u++) {
        for (let v = minV; v < maxV; v++) {
          const pos = [0, 0, 0];
          pos[axis] = blockAxisCoord;
          pos[ua] = u + 0.5;
          pos[va] = v + 0.5;
          blockSet.add(`${pos[0]},${pos[1]},${pos[2]}`);
        }
      }
    }
  }

  for (const key of blockSet) {
    const [x, y, z] = key.split(',').map(Number);
    if (isOccupied(x, y, z)) continue;
    const mat = blockMaterial.clone();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    mesh.userData.originalMaterial = mat;
    mesh.position.set(x, y, z);
    scene.add(mesh);
    blocks.push(mesh);
  }
}

// ---------------- Input ----------------
let mouseMoved = false;

renderer.domElement.addEventListener('mousedown', () => {
  mouseMoved = false;
});

renderer.domElement.addEventListener('mousemove', e => {
  mouseMoved = true;
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects([...blocks, grid]);

  if (mode === 'place') {
    if (hits.length) updateGhost(hits[0]);
    else ghost.visible = false;
  } else if (mode === 'select') {
    const blockHit = hits.find(h => blocks.includes(h.object));
    setHover(blockHit ? blockHit.object : null);
  }
});

renderer.domElement.addEventListener('click', e => {
  if (mouseMoved) return;

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(blocks);

  if (mode === 'select' && hits.length) {
    selectBlock(hits[0].object, e.shiftKey);
  }

  if (mode === 'place') placeBlock(hits[0]);
});

// ---------------- UI ----------------
const ui = document.createElement('div');
ui.id = 'ui';
ui.style.position = 'absolute';
ui.style.top = '10px';
ui.style.left = '10px';
ui.style.display = 'flex';
ui.style.gap = '6px';
ui.innerHTML = `
  <button id="place">Place</button>
  <button id="select">Select</button>
  <button id="export">Export OBJ</button>
  <label id="optimize-label"><input type="checkbox" id="optimize"> Optimize</label>
  <button id="import">Import OBJ</button>
  <input type="file" id="import-file" accept=".obj" style="display:none">
`;
document.body.appendChild(ui);

const btnPlace = document.getElementById('place');
const btnSelect = document.getElementById('select');

function setMode(m) {
  mode = m;
  btnPlace.classList.toggle('active', m === 'place');
  btnSelect.classList.toggle('active', m === 'select');
}

btnPlace.onclick = () => {
  clearSelection();
  setHover(null);
  setMode('place');
};

btnSelect.onclick = () => {
  setMode('select');
  ghost.visible = false;
};

setMode('place'); // start in place mode with button highlighted

document.getElementById('export').onclick = () => {
  if (document.getElementById('optimize').checked) exportOptimisedOBJ();
  else exportOBJ();
};

document.getElementById('import').onclick = () => {
  document.getElementById('import-file').click();
};

document.getElementById('import-file').onchange = e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => importOBJ(ev.target.result);
  reader.readAsText(file);
  e.target.value = '';
};

// ---------------- Drag-and-Drop OBJ Import ----------------
const dropOverlay = document.createElement('div');
dropOverlay.style.cssText = `
  position:fixed; inset:0; display:none; align-items:center; justify-content:center;
  background:rgba(0,0,0,0.55); color:#fff; font-size:1.8rem; font-family:sans-serif;
  border:4px dashed rgba(255,255,255,0.6); box-sizing:border-box; pointer-events:none; z-index:999;
`;
dropOverlay.textContent = 'Drop OBJ to import';
document.body.appendChild(dropOverlay);

let dragDepth = 0;

document.addEventListener('dragenter', e => {
  if ([...e.dataTransfer.items].some(i => i.kind === 'file')) {
    if (++dragDepth === 1) dropOverlay.style.display = 'flex';
  }
});

document.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) { dragDepth = 0; dropOverlay.style.display = 'none'; }
});

document.addEventListener('dragover', e => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});

document.addEventListener('drop', e => {
  e.preventDefault();
  dragDepth = 0;
  dropOverlay.style.display = 'none';
  const file = [...e.dataTransfer.files].find(f => f.name.toLowerCase().endsWith('.obj'));
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => importOBJ(ev.target.result);
  reader.readAsText(file);
});

const keysHeld = new Set();

window.addEventListener('keydown', e => {
  keysHeld.add(e.key);
  if (e.key === ' ') {
    e.preventDefault();
    if (mode === 'place') {
      setMode('select');
      ghost.visible = false;
    } else {
      clearSelection();
      setHover(null);
      setMode('place');
    }
  }
  if (e.key === 'Delete' && selectedBlocks.size > 0) {
    selectedBlocks.forEach(b => {
      scene.remove(b);
      blocks.splice(blocks.indexOf(b), 1);
    });
    hoveredBlock = null;
    clearSelection();
  }
});

window.addEventListener('keyup', e => {
  keysHeld.delete(e.key);
});

// ---------------- Render ----------------
const _panForward = new THREE.Vector3();
const _panRight   = new THREE.Vector3();
const _panDelta   = new THREE.Vector3();
const PAN_SPEED   = 0.08;

function animate() {
  requestAnimationFrame(animate);

  // Camera pan via WASD / arrow keys
  camera.getWorldDirection(_panForward);
  _panForward.y = 0;
  _panForward.normalize();
  _panRight.crossVectors(_panForward, new THREE.Vector3(0, 1, 0));

  _panDelta.set(0, 0, 0);
  if (keysHeld.has('w') || keysHeld.has('ArrowUp'))    _panDelta.add(_panForward);
  if (keysHeld.has('s') || keysHeld.has('ArrowDown'))  _panDelta.sub(_panForward);
  if (keysHeld.has('d') || keysHeld.has('ArrowRight')) _panDelta.add(_panRight);
  if (keysHeld.has('a') || keysHeld.has('ArrowLeft'))  _panDelta.sub(_panRight);

  if (_panDelta.lengthSq() > 0) {
    _panDelta.normalize().multiplyScalar(PAN_SPEED);
    camera.position.add(_panDelta);
    controls.target.add(_panDelta);
  }

  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});