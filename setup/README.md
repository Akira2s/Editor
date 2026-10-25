# Project setup

`setup-stack.mjs` provisions a Babylon.js Editor v5 project for AI-assisted development: Vite + TypeScript
runtime, Havok, art-bible and asset tooling, the Blender and Babylon MCP servers, and the Editor fork's
prefab runtime and packer.

Run it from the new project's folder:

```bash
node <this repo>/setup/setup-stack.mjs
```

It asks up front where things live and which missing prerequisites to install (uv, Blender, this Editor fork).

| Question | Saved as | Default |
|---|---|---|
| Folder of the Editor fork checkout (reused if it exists, cloned there otherwise) | `EDITOR_FORK_DIR` in the project's `.env` | `~/babylonjs-editor/repo` |
| Folder of ComfyUI, used by the ComfyUI helper scripts | `COMFYUI_ROOT` in `.env` | `~/ComfyUI` |

No machine-specific path is hardcoded: an environment variable wins, then the project's `.env`, then the question.
`TOOLS_DIR` (optional, default `~/tools`) is where the retopo helpers look for Instant Meshes, QuadWild and AutoRemesher.

For scripted runs: `--yes` installs everything missing and accepts the default folders, `--no-prompt` installs nothing,
`--install-blender` is kept for compatibility.

The script writes into the current directory (`process.cwd()`), so never run it from inside this repo.
