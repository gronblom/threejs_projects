# three.js projects

Small [three.js](https://threejs.org/) experiments, built with [Vite](https://vite.dev/).

Live: https://gronblom.github.io/threejs_projects/

| Project | What it shows |
| --- | --- |
| [Arctic Waters](projects/arctic-waters/) | A boat on a mirror-calm sea under ray-marched storm clouds (recreation of an r/threejs post) |
| [Basics](projects/basics/) | Meshes, materials, lights and shadows |
| [Galaxy](projects/galaxy/) | A spiral galaxy of 60,000 particles |
| [Terrain](projects/terrain/) | Procedural landscape with water and fog |

## Run locally

Needs [Node.js](https://nodejs.org/) 20+.

```sh
npm install
npm run dev
```

Open the address it prints (http://localhost:5173). Edits reload instantly.

## Add a project

1. Create `projects/<name>/index.html` and `projects/<name>/main.js` (copy an existing one).
2. Add a link to it in the root `index.html`.

`src/setup.js` gives you a renderer, camera, orbit controls and a render loop in one call.

## Deploy

Every push to `main` builds the site and publishes it to GitHub Pages
(`.github/workflows/pages.yml`). One-time setup: **Settings → Pages → Source: GitHub Actions**.
