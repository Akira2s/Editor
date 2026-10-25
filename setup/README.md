# Project setup

`setup-stack.mjs` provisions a Babylon.js Editor v5 project for AI-assisted development: Vite + TypeScript
runtime, Havok, art-bible and asset tooling, the Blender and Babylon MCP servers, the Editor fork's prefab runtime
and packer, and (optionally) ComfyUI with its MCP server.

Run it from the new project's folder:

```bash
node <this repo>/setup/setup-stack.mjs
```

The script writes into the current directory (`process.cwd()`), so never run it from inside this repo.

On Windows, double-click `setup-stack.bat` instead (or run `setup-stack.bat <project folder>`): it asks for the project
folder, creates it if missing, refuses folders inside this repo, asks before using a non-empty one, and runs the
setup in that window so every question is asked.

## What it asks

Everything is asked up front, then done at the end.

| Question | Saved as | Default |
|---|---|---|
| Folder of the Editor fork checkout (reused if it exists, cloned there otherwise) | `EDITOR_FORK_DIR` in the project's `.env` | `~/babylonjs-editor/repo` |
| Folder of ComfyUI | `COMFYUI_ROOT` in `.env` | `~/ComfyUI` |
| Which missing prerequisites to install (uv, Blender, yarn, git, the fork) | | |
| ComfyUI: local (which tier), Comfy Cloud, or skip | `COMFY_MODE`, `COMFY_TIER` in `.env` | the tier your GPU fits |

## The Editor fork

The fork is cloned (branch `akira`) when the folder has no checkout yet; an existing checkout without dependencies is
installed in place. The install follows AGENT.md's Windows steps (`yarn install --ignore-scripts`, `node postinstall.mjs`,
`yarn postinstall` in `editor/`) with `NoDefaultCurrentDirectoryInExePath` cleared, plus `node node_modules/electron/install.js`,
since `--ignore-scripts` also skips the download of the Electron app. It needs:

- **yarn classic**: the fork's own scripts call `yarn`. Installed for the user with `npm install -g yarn@1.22.22` if missing.
- **git**: for the clone and for `yarn install` (the lockfile has git dependencies). The copy bundled with GitHub Desktop
  is used when git is not on PATH; otherwise it is installed with winget / brew.

On Windows, `fork/build-editor.bat` and `fork/start-editor.bat` are copied to the checkout root and listed in its
`.git/info/exclude`, so they never end up in a commit. `build-editor.bat` builds the editor (and `tools`/`cli` the first
time; `build-editor.bat all` rebuilds everything), `start-editor.bat` starts it.

No machine-specific path is hardcoded: a flag wins (`--fork-dir=<path>`, `--comfyui-dir=<path>`), then an environment
variable, then the project's `.env`, then the question. Without a terminal to ask in (an agent or a script running it),
the fork folder is never guessed: pass `--fork-dir`, set `EDITOR_FORK_DIR`, or pass `--yes` to accept the default;
otherwise the fork step is skipped and the script says so.
`TOOLS_DIR` (optional, default `~/tools`) is where the retopo helpers look for Instant Meshes, QuadWild and AutoRemesher.

Scripted runs: `--yes` accepts the defaults and installs everything missing, `--no-prompt` installs nothing,
`--install-blender` is kept for compatibility, `--comfyui=local|cloud|skip`, `--tier=<id>`, `--with=<group,...>`,
`--dry-run` (ComfyUI only: prints every command and download without doing it).

## ComfyUI

`comfyui-setup.mjs` can also be run on its own, from the project folder, to change tier later or to retry downloads
(they resume): `node <this repo>/setup/comfyui-setup.mjs`.

1. **Hardware check.** It reads the largest NVIDIA GPU (`nvidia-smi`), system RAM and free disk, and recommends the
   highest tier the VRAM allows. No NVIDIA GPU, or less VRAM than the lowest tier: it recommends Comfy Cloud.
2. **Local.** Clones ComfyUI at the pinned commit, creates a Python environment with `uv` (CUDA torch, the int8 kernels
   on Windows), installs the custom nodes at pinned commits, downloads the tier's models (size and SHA-256 checked, resumable),
   clones the private `Akira2s/ComfyUI-MCP` repo, runs `uv sync` there and writes its `.env`. It can register the server
   with Claude Code (user scope) if you say yes and no `comfyui` server exists yet.
3. **Comfy Cloud.** Needs a paid plan with API access. It installs only the MCP, stores your API key in the MCP's
   gitignored `.env`, and sets `COMFY_MODE=cloud`. Only `run_workflow` / `list_workflows` work in that mode, and the
   cloud transport follows the documented v1 API but has **not been run against a real account yet**.

Gated models (FLUX.1 Redux, FLUX.2 Klein base 9B) need their license accepted on Hugging Face and a token (`HF_TOKEN`, or
pasted when asked); without one they are skipped and listed.

### Tiers

Defined in `comfyui-tiers.json`; the VRAM numbers are the minimums the recommendation uses (with a 5% tolerance).

| Tier | VRAM | Status |
|---|---|---|
| Ultra | 24 GB | provisional, same models as High until measured |
| High | 16 GB | the verified reference setup (RTX 4070 Ti SUPER) |
| Medium | 12 GB | not measured: mesh stages lowered (Pixal3D int8, mesh resolution 1024) |
| Low | 8 GB | not measured: Trellis2 int8 at 512 for single-image meshes |

Lower tiers still download the High models for the other stages and rely on ComfyUI offloading: the smaller models in the
research (Klein 4B, Klein 9B GGUF, Hunyuan3D mini) are listed under `planned` because the MCP has no graphs for them yet.

### Changing a setup

Edit `comfyui-tiers.json`; nothing else needs to change.

- Move a model id between a tier's stage lists, or give a tier a new `stages` entry (a tier `extends` another and replaces
  only the stages it lists).
- Add a model under `models` with its `source` (`hf` or `modelscope`), `dest` folder under `ComfyUI/models/` and optionally
  `file` (the saved name); then run `node setup/refresh-model-sizes.mjs` to fill in `sizeBytes` and `sha256`.
- `mcpEnv` values become environment variables of the MCP server (`COMFY_PIXAL3D_UNET`, `COMFY_SHAPE_MODEL`,
  `COMFY_TRELLIS_RESOLUTION`); `minVramGb` moves a tier's threshold; `comfyui.commit` and `customNodes[].commit` move the pins.

### Not tested yet

The tier logic, downloads (Hugging Face and ModelScope, resume, checksum, gated errors), the MCP clone and `.env`, and the
dry run were exercised. A full local install (cloning ComfyUI, installing torch, downloading tens of GB) has not been run
end to end, and neither have the interactive prompts, Comfy Cloud with a real key, or the lower tiers' speed and VRAM use.
