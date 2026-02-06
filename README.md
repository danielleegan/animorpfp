# Animo — profile picture morph

Morph one profile picture into another in the browser. You pick both images; face landmarks and triangulation run automatically.

## Stack

- **MediaPipe Face Landmarker** (`@mediapipe/tasks-vision`) — face mesh landmarks (478 points) in the browser
- **Delaunator** — Delaunay triangulation over landmarks + image corners
- **Canvas 2D** — per-triangle affine warp and alpha blend

## Run locally

**Use your system Terminal** (e.g. macOS Terminal or iTerm), not Cursor’s built-in terminal, so the dev server can bind to a port:

```bash
cd /Users/danielleegan/animorpfp
npm install
npm run dev
```

Open the URL shown (e.g. http://localhost:5173), add a **Source** and **Target** image, then use the slider or **Play** to morph.

## Build

```bash
npm run build
```

Output is in `dist/`. Host that folder (e.g. `npx serve dist`) for production.

## If you get terminal errors

- **`listen EPERM` or “operation not permitted” on port 5173**  
  Cursor’s built-in terminal often blocks binding to ports. Use **Terminal.app** or **iTerm**: open it, `cd` into this project, then run `npm run dev`.

- **`/usr/bin/base64: ... /dev/stdout: Operation not permitted`** or **`dump_zsh_state: command not found`**  
  These come from the shell/IDE integration, not from this app. Ignore them if the app still runs.

- **Dependencies not installing**  
  Run `npm install` in your system Terminal (with internet). Then run `npm run dev` from the project folder.

## How it works

1. Each image is cropped to a square (center crop) and resized to 512×512.
2. Face Landmarker returns 478 normalized landmarks; we add 4 image corners and run Delaunator to get a mesh.
3. The mesh for the morph is built from the **midpoint** of the two faces so triangles stay consistent.
4. For a blend amount `t` (0 → 1), we interpolate landmarks to `(1-t)*A + t*B`, then for each triangle warp both images into that shape and blend with alpha `1-t` and `t`.

Best results with clear, front-facing faces and similar framing.
