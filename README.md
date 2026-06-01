# Block Builder

A simple browser-based 3D voxel mesh tool built with Three.js. Place and remove blocks on a grid, save your work to the browser, and export the result as an OBJ file.

## Features

- **Place mode** — click to place blocks on the grid or on top of existing blocks
- **Select mode** — click to select a block (highlights pink), shift-click to add more blocks to the selection
- **Block size** — use the − / + buttons to switch between 1×1, 3×3, and 5×5 placement clusters
- **Delete** — press the Delete key to remove all selected blocks at once
- **Camera** — click and drag to orbit, WASD / arrow keys to pan
- **Save / Load** — save the current scene to the browser's localStorage under a named file; the Load button opens a dialog listing all saves, each with a delete option
- **Filename** — type a project name into the filename field; this name is used as the OBJ filename when exporting
- **OBJ import** — import an OBJ file via the Import button or by dragging and dropping a `.obj` file onto the window; both standard and optimized exports are supported
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
| Drag & drop `.obj` | Import OBJ file |
| Ctrl + A | Select all blocks |
| Ctrl + S | Save to localStorage |
| Ctrl + L | Open Load dialog |
| Ctrl + I | Import OBJ file |
| Ctrl + E | Export OBJ file |
| O | Toggle Optimize on/off |
