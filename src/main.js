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
scene.add(new THREE.AmbientLight(0xffffff, 0.3));

// Primary light — top-right-front
const dir = new THREE.DirectionalLight(0xffffff, 0.9);
dir.position.set(10, 20, 10);
scene.add(dir);

// Secondary light — left-front, lower, dimmer — gives the left face a distinct value
const dir2 = new THREE.DirectionalLight(0xffffff, 0.4);
dir2.position.set(-8, 4, 6);
scene.add(dir2);

// Soft fill light that follows the camera — sits behind, right, and slightly below
// the viewer so blocks always get a gentle kick of illumination from the eye direction.
const camLight = new THREE.PointLight(0xffffff, 0.7, 0);
camLight.position.set(3, -2, 5); // camera-local: right, down, behind
camera.add(camLight);
scene.add(camera);

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
      float fade = 1.0 - smoothstep(uFadeDistance * 0.2, uFadeDistance, dist);
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

const BLOCK_SIZES = [1, 3, 5];
let blockSizeIndex = 0;
let blockSize = 1;

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
    // Start from the mouse's actual hit point so the cluster can be
    // positioned freely (not locked to the hit block's centre).
    pos.copy(intersect.point);
    const n = intersect.face.normal;
    const c = intersect.object.position;
    // Normal axis: flush against the hit block face.
    if (Math.abs(n.x) > 0.5) pos.x = c.x + n.x * (1 + blockSize) / 2;
    if (Math.abs(n.y) > 0.5) pos.y = c.y + n.y * (1 + blockSize) / 2;
    if (Math.abs(n.z) > 0.5) pos.z = c.z + n.z * (1 + blockSize) / 2;
    // Perpendicular axes: snap to the 1×1 grid.
    if (Math.abs(n.x) < 0.5) pos.x = snap(pos.x);
    if (Math.abs(n.y) < 0.5) pos.y = snap(pos.y);
    if (Math.abs(n.z) < 0.5) pos.z = snap(pos.z);
  } else {
    raycaster.ray.intersectPlane(groundPlane, pos);
    pos.x = snap(pos.x);
    pos.y = blockSize / 2; // bottom row of cluster sits on the ground
    pos.z = snap(pos.z);
  }

  ghost.position.copy(pos);
  ghost.visible = true;
}

function placeBlock() {
  const pos = ghost.position.clone();
  const half = (blockSize - 1) / 2;

  for (let dx = -half; dx <= half; dx++) {
    for (let dy = -half; dy <= half; dy++) {
      for (let dz = -half; dz <= half; dz++) {
        const bx = pos.x + dx;
        const by = pos.y + dy;
        const bz = pos.z + dz;
        if (isOccupied(bx, by, bz)) continue;
        const mat = blockMaterial.clone();
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
        mesh.userData.originalMaterial = mat;
        mesh.userData.blockSize = 1;
        mesh.position.set(bx, by, bz);
        scene.add(mesh);
        blocks.push(mesh);
      }
    }
  }
}

// ---------------- Selection ----------------
const hoveredBlocks = new Set();

function setHover(target) {
  hoveredBlocks.forEach(b => {
    if (!selectedBlocks.has(b)) b.material = b.userData.originalMaterial;
  });
  hoveredBlocks.clear();
  if (!target) return;
  const arr = Array.isArray(target) ? target : [target];
  arr.forEach(b => {
    if (!selectedBlocks.has(b)) b.material = hoverMaterial;
    hoveredBlocks.add(b);
  });
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
    obj.material = hoveredBlocks.has(obj) ? hoverMaterial : obj.userData.originalMaterial;
  } else {
    selectedBlocks.add(obj);
    obj.material = selectedMaterial;
    hoveredBlocks.delete(obj);
  }

  // Attach transform gizmo only for single selections
  if (selectedBlocks.size === 1) {
    transformControls.attach([...selectedBlocks][0]);
  } else {
    transformControls.detach();
  }
}

function getBlocksInVolume(hitObj, faceNormal) {
  if (blockSize === 1) return [hitObj];
  const { x: cx, y: cy, z: cz } = hitObj.position;
  const { x: nx, y: ny, z: nz } = faceNormal;
  const half = (blockSize - 1) / 2;
  const posSet = new Set();
  for (let i = -half; i <= half; i++) {
    for (let j = -half; j <= half; j++) {
      for (let k = 0; k < blockSize; k++) {
        let bx = cx, by = cy, bz = cz;
        if      (Math.abs(nx) > 0.5) { by += i; bz += j; bx -= k * Math.sign(nx); }
        else if (Math.abs(ny) > 0.5) { bx += i; bz += j; by -= k * Math.sign(ny); }
        else                          { bx += i; by += j; bz -= k * Math.sign(nz); }
        posSet.add(`${bx},${by},${bz}`);
      }
    }
  }
  return blocks.filter(b => posSet.has(`${b.position.x},${b.position.y},${b.position.z}`));
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
    const s = b.userData.blockSize || 1;

    for (const v of verts) {
      obj += `v ${v[0]*s+x} ${v[1]*s+y} ${v[2]*s+z}\n`;
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

  // Expand each block into its constituent unit cells.
  const gb = [];
  for (const b of blocks) {
    const s = b.userData.blockSize || 1;
    const ox = Math.round(b.position.x - s / 2);
    const oy = Math.round(b.position.y - s / 2);
    const oz = Math.round(b.position.z - s / 2);
    for (let dx = 0; dx < s; dx++)
      for (let dy = 0; dy < s; dy++)
        for (let dz = 0; dz < s; dz++)
          gb.push([ox + dx, oy + dy, oz + dz]);
  }

  const occ = new Set(gb.map(([x, y, z]) => `${x},${y},${z}`));
  const has = (x, y, z) => occ.has(`${x},${y},${z}`);

  const verts = [];
  const quads = [];
  const vmap  = new Map();

  function getV(x, y, z) {
    const k = `${x},${y},${z}`;
    if (!vmap.has(k)) { vmap.set(k, verts.length + 1); verts.push([x, y, z]); }
    return vmap.get(k);
  }

  const faceTypes = [
    [0, +1, 1, 2],
    [0, -1, 1, 2],
    [1, +1, 0, 2],
    [1, -1, 0, 2],
    [2, +1, 0, 1],
    [2, -1, 0, 1],
  ];

  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const b of gb) for (let i = 0; i < 3; i++) {
    if (b[i] < lo[i]) lo[i] = b[i];
    if (b[i] > hi[i]) hi[i] = b[i];
  }

  // Phase 1: greedy meshing — collect rectangles per plane, don't emit yet.
  const planeRects = new Map();

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
        if (!has(nb[0], nb[1], nb[2]))
          grid[b[ua] - lo[ua]][b[va] - lo[va]] = 1;
      }

      const nv = s + (nd === 1 ? 1 : 0);
      const key = `${na},${nd},${nv}`;
      if (!planeRects.has(key)) planeRects.set(key, []);
      const rects = planeRects.get(key);

      for (let i = 0; i < uw; i++) {
        for (let j = 0; j < vw; j++) {
          if (!grid[i][j] || done[i][j]) continue;

          let wi = 1;
          while (i + wi < uw && grid[i + wi][j] && !done[i + wi][j]) wi++;

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

          rects.push({ na, nd, ua, va, nv,
            u0: lo[ua] + i,     u1: lo[ua] + i + wi,
            v0: lo[va] + j,     v1: lo[va] + j + wj });
        }
      }
    }
  }

  // Phase 2: normalise boundaries then merge without introducing T-junctions.
  for (const rects of planeRects.values()) {

    // Step A — collect every u/v boundary coordinate from all rects in this plane
    // and split every rect along all of them. After this, all rects are atomic:
    // each spans exactly one boundary interval in each axis, so no T-junctions exist.
    const uSet = new Set(), vSet = new Set();
    for (const r of rects) { uSet.add(r.u0); uSet.add(r.u1); vSet.add(r.v0); vSet.add(r.v1); }
    const uB = [...uSet].sort((a, b) => a - b);
    const vB = [...vSet].sort((a, b) => a - b);

    const atomics = [];
    for (const r of rects) {
      const us = uB.filter(u => u >= r.u0 && u <= r.u1);
      const vs = vB.filter(v => v >= r.v0 && v <= r.v1);
      for (let ui = 0; ui < us.length - 1; ui++)
        for (let vi = 0; vi < vs.length - 1; vi++)
          atomics.push({ ...r, u0: us[ui], u1: us[ui + 1], v0: vs[vi], v1: vs[vi + 1] });
    }
    rects.length = 0;
    rects.push(...atomics);

    // Step B — T-junction-safe merge: only merge two rects when no third rect has
    // a corner on the boundary being eliminated. The range check is inclusive so it
    // also catches junction-point corners at the endpoints of the eliminated edge —
    // those become interior to the merged rect's outer edges and would be T-junctions.
    let changed = true;
    while (changed) {
      changed = false;
      outer: for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i], b = rects[j];
          let m = null, fAxis, fCoord, rMin, rMax;

          if      (a.u1===b.u0 && a.v0===b.v0 && a.v1===b.v1) { m={...a,u1:b.u1}; fAxis='u'; fCoord=a.u1; rMin=a.v0; rMax=a.v1; }
          else if (b.u1===a.u0 && a.v0===b.v0 && a.v1===b.v1) { m={...a,u0:b.u0}; fAxis='u'; fCoord=b.u1; rMin=a.v0; rMax=a.v1; }
          else if (a.v1===b.v0 && a.u0===b.u0 && a.u1===b.u1) { m={...a,v1:b.v1}; fAxis='v'; fCoord=a.v1; rMin=a.u0; rMax=a.u1; }
          else if (b.v1===a.v0 && a.u0===b.u0 && a.u1===b.u1) { m={...a,v0:b.v0}; fAxis='v'; fCoord=b.v1; rMin=a.u0; rMax=a.u1; }

          if (!m) continue;

          let safe = true;
          for (let k = 0; k < rects.length && safe; k++) {
            if (k === i || k === j) continue;
            const c = rects[k];
            for (const [cu, cv] of [[c.u0,c.v0],[c.u1,c.v0],[c.u1,c.v1],[c.u0,c.v1]]) {
              const hit = fAxis === 'u'
                ? cu === fCoord && cv >= rMin && cv <= rMax
                : cv === fCoord && cu >= rMin && cu <= rMax;
              if (hit) { safe = false; break; }
            }
          }

          if (safe) { rects[i] = m; rects.splice(j, 1); changed = true; break outer; }
        }
      }
    }
  }

  // Phase 3: emit merged rects as 4-vertex quads.
  for (const rects of planeRects.values()) {
    for (const { na, nd, ua, va, nv, u0, u1, v0, v1 } of rects) {
      const pt = (u, v) => { const c = [0, 0, 0]; c[na] = nv; c[ua] = u; c[va] = v; return c; };
      const flip = na % 2 === 0 ? nd : -nd;
      const corners = flip > 0
        ? [pt(u0,v0), pt(u1,v0), pt(u1,v1), pt(u0,v1)]
        : [pt(u0,v0), pt(u0,v1), pt(u1,v1), pt(u1,v0)];
      quads.push(corners.map(([x, y, z]) => getV(x, y, z)));
    }
  }

  let obj = '';
  for (const [x, y, z] of verts) obj += `v ${x} ${y} ${z}\n`;
  for (const f of quads)         obj += `f ${f.join(' ')}\n`;

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
let mouseDownX = 0, mouseDownY = 0;
const DRAG_THRESHOLD_SQ = 36; // 6px radius before a move counts as a drag

renderer.domElement.addEventListener('mousedown', e => {
  mouseDownX = e.clientX;
  mouseDownY = e.clientY;
});

renderer.domElement.addEventListener('mousemove', e => {

  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects([...blocks, grid]);

  if (mode === 'place') {
    if (hits.length) updateGhost(hits[0]);
    else ghost.visible = false;
  } else if (mode === 'select') {
    const blockHit = hits.find(h => blocks.includes(h.object));
    setHover(blockHit ? getBlocksInVolume(blockHit.object, blockHit.face.normal) : null);
  }
});

renderer.domElement.addEventListener('mouseleave', () => {
  ghost.visible = false;
  setHover(null);
});

renderer.domElement.addEventListener('click', e => {
  const dx = e.clientX - mouseDownX, dy = e.clientY - mouseDownY;
  if (dx * dx + dy * dy > DRAG_THRESHOLD_SQ) return;

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(blocks);

  if (mode === 'select' && hits.length) {
    const hit = hits[0];
    if (blockSize === 1) {
      selectBlock(hit.object, e.shiftKey);
    } else {
      const volume = getBlocksInVolume(hit.object, hit.face.normal);
      if (!e.shiftKey) clearSelection();
      volume.forEach(b => {
        selectedBlocks.add(b);
        b.material = selectedMaterial;
        hoveredBlocks.delete(b);
      });
      if (selectedBlocks.size === 1) transformControls.attach([...selectedBlocks][0]);
      else transformControls.detach();
    }
    selectClickCount++;
    if (selectClickCount % 3 === 0) showHint(deleteHint);
  }

  if (mode === 'place') placeBlock();
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
  <button id="size-down">−</button>
  <span id="size-label">1×1</span>
  <button id="size-up">+</button>
  <button id="import">Import OBJ</button>
  <input type="file" id="import-file" accept=".obj" style="display:none">
  <button id="export">Export OBJ</button>
  <label id="optimize-label"><input type="checkbox" id="optimize"> Optimize</label>
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

function setBlockSize(index) {
  blockSizeIndex = index;
  blockSize = BLOCK_SIZES[blockSizeIndex];
  ghost.scale.setScalar(blockSize);
  const label = `${blockSize}×${blockSize}`;
  document.getElementById('size-label').textContent = label;
  document.getElementById('size-down').disabled = blockSizeIndex === 0;
  document.getElementById('size-up').disabled   = blockSizeIndex === BLOCK_SIZES.length - 1;
}

document.getElementById('size-down').onclick = () => setBlockSize(Math.max(0, blockSizeIndex - 1));
document.getElementById('size-up').onclick   = () => setBlockSize(Math.min(BLOCK_SIZES.length - 1, blockSizeIndex + 1));
setBlockSize(0);

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

// ---------------- Hint Popovers ----------------
function makeHint(text) {
  const el = document.createElement('div');
  el.className = 'hint-popover';
  el.textContent = text;
  document.body.appendChild(el);
  return el;
}

function showHint(el) {
  const rect = document.getElementById('select').getBoundingClientRect();
  el.style.left = `${rect.left + rect.width / 2}px`;
  el.style.top  = `${rect.bottom + 10}px`;
  el.classList.remove('hiding');
  el.classList.add('visible');
  setTimeout(() => {
    el.classList.remove('visible');
    el.classList.add('hiding');
    el.addEventListener('animationend', () => el.classList.remove('hiding'), { once: true });
  }, 5000);
}

const ctrlAHint  = makeHint('CTRL+A to Select All');
const deleteHint = makeHint('Press Delete to remove Selected blocks');

let deletedCount    = 0;
let ctrlAHintShown  = false;
let selectClickCount = 0;

const keysHeld = new Set();

window.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 'a') {
    e.preventDefault();
    setMode('select');
    ghost.visible = false;
    clearSelection();
    blocks.forEach(b => {
      selectedBlocks.add(b);
      b.material = selectedMaterial;
    });
    transformControls.detach();
    return;
  }

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
    deletedCount += selectedBlocks.size;
    selectClickCount = 0;
    selectedBlocks.forEach(b => {
      scene.remove(b);
      blocks.splice(blocks.indexOf(b), 1);
    });
    hoveredBlock = null;
    clearSelection();
    if (!ctrlAHintShown && deletedCount > 4 && blocks.length > 3) {
      ctrlAHintShown = true;
      showHint(ctrlAHint);
    }
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