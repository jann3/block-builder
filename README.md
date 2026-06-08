# Block Builder

A simple browser-based 3D voxel mesh tool built with Three.js. Place and remove blocks on a grid, save your work to the browser, and export the result as an OBJ file.

## Features

- **Place mode** — click to place blocks on the grid or on top of existing blocks
- **Select mode** — click to select a block (highlights pink), shift-click to add to the selection; move handle appears for single selections (suppressed while shift is held)
- **Block size** — use the − / + buttons (or keyboard shortcuts) to switch between 1×1, 3×3, and 5×5 placement clusters; size applies to both placement and selection
- **Delete** — press the Delete key or long-press on a touch screen to remove all selected blocks at once
- **Camera** — click and drag to orbit, right-click and drag to pan, scroll to zoom, WASD / arrow keys to pan
- **Save / Load** — save the current scene to the browser's localStorage under a named file; the Load button opens a dialog listing all saves, each with a delete option
- **Filename** — type a project name into the filename field; this name is used as the OBJ filename when exporting
- **OBJ import** — import an OBJ file via the Import button or by dragging and dropping a `.obj` file onto the window; both standard and optimized exports are supported
- **OBJ export** — export the mesh as a standard OBJ file; standard exports can be re-imported into Block Builder to continue editing
- **Optimized OBJ export** — tick Optimize before exporting to get a clean mesh with faces reduced and merged for a lower polygon count; intended for finalized exports to other tools or games
- **Help modal** — click the `?` button to open an in-app help overlay covering all features and shortcuts; press `?` or Escape to dismiss
- **Responsive layout** — the toolbar rearranges for portrait and small screens, with the file controls moving to the bottom of the screen when space is limited

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
| Right-click + drag | Pan camera |
| Scroll | Zoom camera |
| W / A / S / D | Pan camera |
| Arrow keys | Pan camera |
| Space | Toggle between Place and Select mode |
| − / + | Decrease / increase block size |
| Delete | Delete selected block(s) |
| Long-press (touch) | Delete selected block(s) |
| Drag & drop `.obj` | Import OBJ file |
| Ctrl + A | Select all blocks |
| Ctrl + S | Save to localStorage |
| Ctrl + L | Open Load dialog |
| Ctrl + I | Import OBJ file |
| Ctrl + E | Export OBJ file |
| O | Toggle Optimize on/off |
| ? | Open / close help |
