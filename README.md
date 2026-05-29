# Block Builder

A simple browser-based 3D voxel mesh tool built with Three.js. Place and remove blocks on a grid, then export the result as an OBJ file.

## Features

- **Place mode** — click to place blocks on the grid or on top of existing blocks
- **Select mode** — click to select a block (highlights pink), shift-click to add more blocks to the selection
- **Delete** — press the Delete key to remove all selected blocks at once
- **Camera** — click and drag to orbit, WASD / arrow keys to pan
- **OBJ export** — export the mesh as a standard OBJ file
- **Optimized OBJ export** — tick Optimize before exporting to get a clean mesh with hidden internal faces removed and coplanar faces merged (greedy meshing)

## Install

Requires [Node.js](https://nodejs.org).

```bash
npm install
npm run dev
```

Then open the local URL shown in the terminal (typically `http://localhost:5173`).

## Controls

| Input | Action |
|---|---|
| Click | Place block (Place mode) / Select block (Select mode) |
| Shift + click | Add block to selection |
| Click + drag | Orbit camera |
| W / A / S / D | Pan camera |
| Arrow keys | Pan camera |
| Space | Toggle between Place and Select mode |
| Delete | Delete selected block(s) |
