# Project setup

`setup-stack.mjs` provisions a Babylon.js Editor v5 project for AI-assisted development: Vite + TypeScript
runtime, Havok, art-bible and asset tooling, the Blender and Babylon MCP servers, and the Editor fork's
prefab runtime and packer.

Run it from the new project's folder:

```bash
node <this repo>/setup/setup-stack.mjs
```

It asks up front which missing prerequisites to install (uv, Blender, this Editor fork). For scripted runs:
`--yes` installs everything missing, `--no-prompt` installs nothing, `--install-blender` is kept for compatibility.
`EDITOR_FORK_DIR` overrides where the fork checkout is expected.

The script writes into the current directory (`process.cwd()`), so never run it from inside this repo.
