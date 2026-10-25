#!/usr/bin/env node
// ComfyUI + ComfyUI MCP setup for the Babylon.js Editor AI stack.
//
//   node setup/comfyui-setup.mjs [--comfyui=local|cloud|skip] [--tier=<id>] [--with=<group,...>] [--dry-run] [--yes]
//
// Run from the project folder (it writes COMFY_* values into the project's .env). setup-stack.mjs calls the same
// functions: planComfyUI() asks everything up front, runComfyUIPlan() does the work later. What is installed is
// defined in comfyui-tiers.json, not here.
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline/promises';
import { spawnSync } from 'child_process';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { fileURLToPath, pathToFileURL } from 'url';

const MANIFEST_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'comfyui-tiers.json');
const isWindows = process.platform === 'win32';

export const loadManifest = () => JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));

const gb = bytes => (bytes / 1e9).toFixed(1);

// ---------------------------------------------------------------------------
// Hardware and tiers
// ---------------------------------------------------------------------------
export function detectHardware(targetDir) {
  const gpus = [];
  const r = spawnSync('nvidia-smi', ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader,nounits'], { encoding: 'utf-8' });
  if (r.status === 0) {
    for (const line of r.stdout.trim().split(/\r?\n/).filter(Boolean)) {
      const [name, memMiB, driver] = line.split(',').map(s => s.trim());
      gpus.push({ name, vramGb: Number(memMiB) / 1024, driver });
    }
  }

  let freeDiskGb = null;
  try {
    let dir = targetDir;
    while (!fs.existsSync(dir) && path.dirname(dir) !== dir) dir = path.dirname(dir);
    const stats = fs.statfsSync(dir);
    freeDiskGb = (stats.bavail * stats.bsize) / 1024 ** 3;
  } catch {
    // statfs is missing on old Node versions; the disk check is then skipped
  }

  return { gpus, ramGb: os.totalmem() / 1024 ** 3, freeDiskGb };
}

/** The highest tier the largest NVIDIA GPU can run, or null (no NVIDIA GPU, or less VRAM than the lowest tier). */
export function recommendTier(manifest, hardware) {
  const vram = Math.max(0, ...hardware.gpus.map(g => g.vramGb));
  const factor = manifest.vramToleranceFactor ?? 1;
  const byVram = Object.keys(manifest.tiers).sort((a, b) => manifest.tiers[b].minVramGb - manifest.tiers[a].minVramGb);
  return byVram.find(id => vram >= manifest.tiers[id].minVramGb * factor) ?? null;
}

/** A tier with its `extends` chain applied: stages are replaced one by one, mcpEnv and notes are merged. */
export function resolveTier(manifest, id, seen = new Set()) {
  const tier = manifest.tiers[id];
  if (!tier) throw new Error(`Unknown tier "${id}". Known tiers: ${Object.keys(manifest.tiers).join(', ')}`);
  if (seen.has(id)) throw new Error(`Tier "${id}" extends itself`);
  seen.add(id);
  const base = tier.extends ? resolveTier(manifest, tier.extends, seen) : { stages: {}, mcpEnv: {}, planned: [], notes: [] };
  return {
    id,
    label: tier.label,
    minVramGb: tier.minVramGb,
    status: tier.status,
    stages: { ...base.stages, ...(tier.stages ?? {}) },
    mcpEnv: { ...base.mcpEnv, ...(tier.mcpEnv ?? {}) },
    planned: tier.planned ?? [],
    notes: [...base.notes, ...(tier.notes ?? [])]
  };
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------
export const modelFile = model => model.file ?? path.basename(model.source.path);
export const modelPath = (comfyRoot, model) => path.join(comfyRoot, 'ComfyUI', 'models', model.dest, modelFile(model));

export function modelUrl(model) {
  const { type, repo, path: filePath } = model.source;
  if (type === 'hf') return `https://huggingface.co/${repo}/resolve/main/${filePath.split('/').map(encodeURIComponent).join('/')}`;
  if (type === 'modelscope') return `https://www.modelscope.ai/api/v1/models/${repo}/repo?Revision=master&FilePath=${encodeURIComponent(filePath)}`;
  throw new Error(`Unknown model source type "${type}"`);
}

/** Model ids of a resolved tier plus the chosen optional groups, without duplicates. */
export function tierModelIds(manifest, tier, groups = []) {
  const ids = new Set(Object.values(tier.stages).flatMap(stage => stage.models));
  for (const group of groups) for (const id of manifest.optionalGroups[group].models) ids.add(id);
  return [...ids];
}

/** 'present' (right size), 'differs' (a file with another size is there: left alone) or 'missing'. */
export function modelStatus(comfyRoot, model) {
  const file = modelPath(comfyRoot, model);
  if (!fs.existsSync(file)) return 'missing';
  return model.sizeBytes && fs.statSync(file).size !== model.sizeBytes ? 'differs' : 'present';
}

function sha256Of(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', c => hash.update(c)).on('end', () => resolve(hash.digest('hex'))).on('error', reject);
  });
}

export function findHuggingFaceToken() {
  if (process.env.HF_TOKEN) return process.env.HF_TOKEN;
  for (const file of [path.join(os.homedir(), '.cache', 'huggingface', 'token'), path.join(os.homedir(), '.huggingface', 'token')]) {
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf-8').trim();
  }
  return null;
}

/** Downloads to <dest>.part (resumable), checks size and checksum, then renames. The token only goes to huggingface.co. */
export async function downloadModel(model, dest, token) {
  const part = `${dest}.part`;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const url = modelUrl(model);

  for (let attempt = 1; ; attempt++) {
    let have = fs.existsSync(part) ? fs.statSync(part).size : 0;
    if (model.sizeBytes && have > model.sizeBytes) {
      fs.rmSync(part);
      have = 0;
    }
    if (!model.sizeBytes || have < model.sizeBytes) {
      try {
        const headers = {};
        if (token && new URL(url).hostname.endsWith('huggingface.co')) headers.Authorization = `Bearer ${token}`;
        if (have > 0) headers.Range = `bytes=${have}-`;
        const res = await fetch(url, { headers, redirect: 'follow' });
        if (res.status === 401 || res.status === 403) {
          throw Object.assign(new Error(`access denied (HTTP ${res.status}): accept the license on the model page and use a Hugging Face token`), { fatal: true });
        }
        if (res.status !== 200 && res.status !== 206) throw new Error(`HTTP ${res.status}`);
        if (res.status === 200) have = 0;

        const total = model.sizeBytes ?? Number(res.headers.get('content-length')) + have;
        let received = have;
        let lastPrint = 0;
        const body = Readable.fromWeb(res.body);
        body.on('data', chunk => {
          received += chunk.length;
          if (Date.now() - lastPrint > 1000) {
            lastPrint = Date.now();
            process.stdout.write(`\r    ${gb(received)} / ${gb(total)} GB (${Math.floor((received / total) * 100)}%)   `);
          }
        });
        await pipeline(body, fs.createWriteStream(part, { flags: res.status === 206 ? 'a' : 'w' }));
        process.stdout.write('\r' + ' '.repeat(60) + '\r');
      } catch (err) {
        if (err.fatal || attempt >= 3) throw err;
        console.log(`    ${err.message}; retrying (${attempt}/3)`);
        continue;
      }
    }

    if (model.sizeBytes && fs.statSync(part).size !== model.sizeBytes) {
      if (attempt >= 3) throw new Error('the download is incomplete');
      continue;
    }
    if (model.sha256 && (await sha256Of(part)) !== model.sha256) {
      fs.rmSync(part);
      throw new Error('checksum mismatch, the file was deleted');
    }
    fs.renameSync(part, dest);
    return;
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function run(ctx, cmd, args, opts = {}) {
  console.log(`  $ ${cmd} ${args.map(a => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`);
  if (ctx.dryRun) return;
  const r = opts.shell
    ? spawnSync([cmd, ...args].map(quote).join(' '), { stdio: 'inherit', cwd: opts.cwd, shell: true })
    : spawnSync(cmd, args, { stdio: 'inherit', cwd: opts.cwd });
  if (r.status !== 0) throw new Error(`"${cmd} ${args[0]}" failed (${r.error?.message ?? `exit ${r.status}`})`);
}

// `claude` is a .cmd shim on Windows: it runs through one quoted command string rather than args plus the shell option.
const quote = arg => (/[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg);
const quiet = (cmd, args, opts = {}) =>
  (opts.shell ? spawnSync([cmd, ...args].map(quote).join(' '), { encoding: 'utf-8', shell: true }) : spawnSync(cmd, args, { encoding: 'utf-8', cwd: opts.cwd })).status === 0;

function writeEnvFile(file, values) {
  const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8').split(/\r?\n/) : [];
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  for (const [key, value] of Object.entries(values)) {
    const at = lines.findIndex(l => l.startsWith(`${key}=`));
    if (at >= 0) lines[at] = `${key}=${value}`;
    else lines.push(`${key}=${value}`);
  }
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf-8');
}

const venvPython = comfyRoot => {
  const portable = path.join(comfyRoot, 'python', isWindows ? 'python.exe' : 'bin/python');
  const venv = path.join(comfyRoot, 'ComfyUI', '.venv', isWindows ? 'Scripts/python.exe' : 'bin/python');
  return fs.existsSync(portable) ? portable : venv;
};

// ---------------------------------------------------------------------------
// Plan: every question, asked up front
// ---------------------------------------------------------------------------
async function ask(ctx, question, fallback = '') {
  if (!ctx.rl) return fallback;
  return (await ctx.rl.question(question)).trim();
}

const askYesNo = async (ctx, question, fallback) => {
  const answer = (await ask(ctx, `${question} ${fallback ? '[Y/n]' : '[y/N]'} `, '')).toLowerCase();
  return answer === '' ? fallback : answer.startsWith('y');
};

/** Registering edits Claude Code's user-level config, so it is only done when asked (never in scripted runs). */
const askRegister = ctx => (ctx.rl ? askYesNo(ctx, '  Register the comfyui MCP server with Claude Code (user scope; skipped if one exists)?', true) : false);

function flagValue(args, name) {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

/**
 * ctx: { rl, interactive, assumeYes, cliArgs, comfyRoot, projectDir }
 * Returns a plan for runComfyUIPlan(), or null when nothing should be installed.
 */
export async function planComfyUI(ctx) {
  const manifest = loadManifest();
  const hardware = detectHardware(ctx.comfyRoot);
  const recommended = recommendTier(manifest, hardware);
  const lowest = Object.values(manifest.tiers).reduce((a, b) => (a.minVramGb < b.minVramGb ? a : b));

  console.log('ComfyUI (image, turnaround and 3D mesh generation)');
  if (hardware.gpus.length === 0) console.log('  GPU: no NVIDIA GPU found (these models need CUDA)');
  for (const g of hardware.gpus) console.log(`  GPU: ${g.name}, ${g.vramGb.toFixed(1)} GB VRAM, driver ${g.driver}`);
  console.log(`  RAM: ${hardware.ramGb.toFixed(0)} GB${hardware.freeDiskGb == null ? '' : `, ${hardware.freeDiskGb.toFixed(0)} GB free where ComfyUI will go`}`);
  console.log(
    recommended
      ? `  Recommended: local, ${manifest.tiers[recommended].label} tier (needs ${manifest.tiers[recommended].minVramGb} GB VRAM)\n`
      : `  Recommended: Comfy Cloud (the lowest local tier needs an NVIDIA GPU with ${lowest.minVramGb} GB VRAM)\n`
  );

  // 1. Local, cloud or neither
  let mode = flagValue(ctx.cliArgs, 'comfyui');
  if (!mode) {
    if (ctx.cliArgs.includes('--no-comfyui')) mode = 'skip';
    else if (ctx.assumeYes) mode = recommended ? 'local' : 'skip';
    else if (!ctx.rl) mode = 'skip';
    else {
      const options = recommended
        ? ['local', 'local-other', 'cloud', 'skip']
        : ['cloud', 'local-other', 'skip'];
      const labels = {
        local: `Local ComfyUI, ${manifest.tiers[recommended]?.label} tier (recommended)`,
        'local-other': recommended ? 'Local ComfyUI, choose another tier' : 'Local ComfyUI anyway (not recommended for this hardware)',
        cloud: `Comfy Cloud${recommended ? '' : ' (recommended)'}: no local GPU needed, paid plan with an API key`,
        skip: 'Skip, set it up later (node setup/comfyui-setup.mjs)'
      };
      options.forEach((o, i) => console.log(`  ${i + 1}. ${labels[o]}`));
      const pick = Number(await ask(ctx, `  Choose [1-${options.length}] (1): `, '1')) || 1;
      mode = options[Math.min(Math.max(pick, 1), options.length) - 1];
    }
  }
  if (mode === 'skip') {
    console.log('  Skipping ComfyUI.\n');
    return null;
  }

  const comfyDir = ctx.comfyRoot;
  const mcpDir = path.join(comfyDir, manifest.mcp.dir);

  // 2a. Cloud: only the MCP and an API key
  if (mode === 'cloud') {
    console.log('\n  Comfy Cloud needs a paid plan with API access (Standard is the cheapest; own models/LoRAs need Creator).');
    console.log('  Plans: https://www.comfy.org/cloud/pricing   API docs: https://docs.comfy.org/development/cloud/overview');
    console.log('  Not every local tool exists there: custom nodes cannot be installed, so use run_workflow with workflows built from');
    console.log('  what your account lists. The key is stored in the MCP folder\'s .env (not committed).');
    const apiKey = process.env.COMFY_CLOUD_API_KEY || (await ask(ctx, '  Comfy Cloud API key (Enter to add it later): ', ''));
    const registerMcp = await askRegister(ctx);
    console.log('');
    return { mode: 'cloud', manifest, comfyDir, mcpDir, apiKey, registerMcp, dryRun: ctx.dryRun };
  }

  // 2b. Local: tier and optional groups
  let tierId = flagValue(ctx.cliArgs, 'tier') ?? (mode === 'local' ? recommended : null);
  if (!tierId) {
    const ids = Object.keys(manifest.tiers).sort((a, b) => manifest.tiers[b].minVramGb - manifest.tiers[a].minVramGb);
    if (!ctx.rl) tierId = recommended ?? ids[ids.length - 1];
    else {
      ids.forEach((id, i) => console.log(`  ${i + 1}. ${manifest.tiers[id].label} (${manifest.tiers[id].minVramGb} GB): ${manifest.tiers[id].status}`));
      const def = Math.max(ids.indexOf(recommended) + 1, 1);
      const pick = Number(await ask(ctx, `  Tier [1-${ids.length}] (${def}): `, String(def))) || def;
      tierId = ids[Math.min(Math.max(pick, 1), ids.length) - 1];
    }
  }
  const tier = resolveTier(manifest, tierId);

  let groups = (flagValue(ctx.cliArgs, 'with') ?? '').split(',').filter(Boolean);
  if (!flagValue(ctx.cliArgs, 'with') && ctx.rl) {
    for (const [name, group] of Object.entries(manifest.optionalGroups)) {
      const core = new Set(tierModelIds(manifest, tier));
      const extra = group.models.filter(id => !core.has(id));
      const bytes = extra.reduce((sum, id) => sum + manifest.models[id].sizeBytes, 0);
      if (extra.length > 0 && (await askYesNo(ctx, `  Also install ${group.label}? (${gb(bytes)} GB)`, false))) groups.push(name);
    }
  }

  const ids = tierModelIds(manifest, tier, groups);
  const statuses = ids.map(id => ({ id, model: manifest.models[id], status: modelStatus(comfyDir, manifest.models[id]) }));
  const missing = statuses.filter(s => s.status === 'missing');

  // Gated models need a Hugging Face token (and the license accepted on the model page)
  let token = findHuggingFaceToken();
  const gated = missing.filter(s => s.model.gated);
  if (gated.length > 0 && !token) {
    console.log(`\n  ${gated.length} model(s) are gated on Hugging Face (${gated.map(s => s.model.label).join(', ')}).`);
    if (ctx.rl) {
      console.log('  Accept their licenses on the model pages, then paste a read token (https://huggingface.co/settings/tokens).');
      token = (await ask(ctx, '  Hugging Face token (Enter to skip those models): ', '')) || null;
    } else {
      console.log('  Set HF_TOKEN (after accepting their licenses) to download them.');
    }
  }
  const toDownload = missing.filter(s => !s.model.gated || token);

  // Summary
  const bytes = toDownload.reduce((sum, s) => sum + s.model.sizeBytes, 0);
  console.log(`\n  ${tier.label} tier${groups.length ? ` + ${groups.join(', ')}` : ''}: ${tier.status}`);
  for (const [stage, def] of Object.entries(tier.stages)) {
    console.log(`    ${manifest.stageLabels[stage] ?? stage}: ${def.models.map(id => manifest.models[id].label).join(', ')}`);
  }
  for (const line of [...tier.planned.map(p => `Planned, not installed yet: ${p}`), ...tier.notes]) console.log(`    - ${line}`);
  for (const s of statuses.filter(s => s.status === 'differs')) console.log(`    ! ${modelFile(s.model)} exists with a different size; left untouched`);
  for (const s of missing.filter(s => s.model.gated && !token)) console.log(`    ! ${s.model.label}: gated, skipped without a token`);
  const restricted = toDownload.filter(s => s.model.commercialUse !== true);
  if (restricted.length > 0) {
    console.log('    Licenses to check before shipping assets made with them:');
    for (const s of restricted) console.log(`      ${s.model.label}: ${s.model.license}`);
  }
  console.log(`    To download: ${toDownload.length} file(s), ${gb(bytes)} GB${hardware.freeDiskGb != null ? ` (free: ${hardware.freeDiskGb.toFixed(0)} GB)` : ''}`);
  if (hardware.freeDiskGb != null && bytes / 1024 ** 3 > hardware.freeDiskGb) console.log('    ! Not enough free disk space for all of it.');

  const registerMcp = await askRegister(ctx);
  if (ctx.rl && !(await askYesNo(ctx, '  Proceed?', true))) {
    console.log('  Skipping ComfyUI.\n');
    return null;
  }
  console.log('');
  return { mode: 'local', manifest, comfyDir, mcpDir, tier, groups, toDownload, token, registerMcp, dryRun: ctx.dryRun };
}

// ---------------------------------------------------------------------------
// Run the plan
// ---------------------------------------------------------------------------
function cloneAt(ctx, repo, dir, commit) {
  if (fs.existsSync(path.join(dir, '.git'))) {
    console.log(`  Reusing ${dir}`);
    return;
  }
  run(ctx, 'git', ['clone', repo, dir]);
  if (commit) run(ctx, 'git', ['-C', dir, 'checkout', '--quiet', commit]);
}

function installComfyUI(ctx, plan) {
  const { manifest, comfyDir } = plan;
  const config = manifest.comfyui;
  const source = path.join(comfyDir, 'ComfyUI');
  const python = venvPython(comfyDir);

  console.log('ComfyUI');
  fs.mkdirSync(comfyDir, { recursive: true });
  cloneAt(ctx, config.repo, source, config.commit);

  if (fs.existsSync(python)) console.log(`  Reusing the Python environment ${python}`);
  else {
    run(ctx, 'uv', ['venv', path.join(source, '.venv'), '--python', config.python]);
    run(ctx, 'uv', ['pip', 'install', '--python', python, '--index-url', config.torch.index, ...config.torch.packages]);
    run(ctx, 'uv', ['pip', 'install', '--python', python, '-r', path.join(source, 'requirements.txt')]);
    const extra = config.extraPackages?.[process.platform] ?? [];
    if (extra.length > 0) run(ctx, 'uv', ['pip', 'install', '--python', python, ...extra]);
  }

  for (const node of manifest.customNodes) {
    const dir = path.join(source, 'custom_nodes', node.name);
    cloneAt(ctx, node.repo, dir, node.commit);
    const requirements = path.join(dir, 'requirements.txt');
    if (ctx.dryRun || fs.existsSync(requirements)) run(ctx, 'uv', ['pip', 'install', '--python', python, '-r', requirements]);
  }
}

async function downloadModels(ctx, plan) {
  console.log('\nModels');
  for (const { model } of plan.toDownload) {
    const dest = modelPath(plan.comfyDir, model);
    console.log(`  ${model.label} (${gb(model.sizeBytes)} GB) -> ${path.relative(plan.comfyDir, dest)}`);
    if (ctx.dryRun) continue;
    try {
      await downloadModel(model, dest, plan.token);
    } catch (err) {
      console.log(`    ❌ ${err.message}`);
      plan.failed = (plan.failed ?? 0) + 1;
    }
  }
}

function installMcp(ctx, plan, envValues) {
  const { manifest, mcpDir } = plan;
  console.log('\nComfyUI MCP');
  fs.mkdirSync(plan.comfyDir, { recursive: true });
  try {
    cloneAt(ctx, manifest.mcp.repo, mcpDir);
  } catch (err) {
    console.log(`  ❌ ${err.message}\n  The MCP repo is private: sign in to GitHub (gh auth login) with an account that can read it and re-run.`);
    return false;
  }
  run(ctx, 'uv', ['sync'], { cwd: mcpDir });
  if (ctx.dryRun) console.log(`  Would write ${Object.keys(envValues).join(', ')} to ${path.join(mcpDir, '.env')}`);
  else {
    writeEnvFile(path.join(mcpDir, '.env'), envValues);
    console.log(`  ✅ Settings written to ${path.join(mcpDir, '.env')} (not committed)`);
  }

  const register = ['mcp', 'add', '--scope', 'user', 'comfyui', '--', 'uv', '--directory', mcpDir, 'run', 'main.py'];
  const hasClaude = quiet('claude', ['--version'], { shell: isWindows });
  if (hasClaude && quiet('claude', ['mcp', 'get', 'comfyui'], { shell: isWindows })) {
    console.log('  A "comfyui" MCP server is already registered with Claude Code; left unchanged.');
    console.log(`  To use this copy instead: claude mcp remove comfyui --scope user, then claude ${register.join(' ')}`);
  } else if (hasClaude && ctx.registerMcp) {
    run(ctx, 'claude', register, { shell: isWindows });
  } else {
    console.log(`  Register it with Claude Code:\n    claude ${register.map(a => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`);
  }
  return true;
}

/** ctx: { dryRun, setProjectEnv(key, value) } */
export async function runComfyUIPlan(plan, ctx = {}) {
  if (!plan) return;
  const run_ctx = { dryRun: plan.dryRun || ctx.dryRun, registerMcp: plan.registerMcp };

  try {
    if (plan.mode === 'local') {
      installComfyUI(run_ctx, plan);
      await downloadModels(run_ctx, plan);
      const env = {
        COMFYUI_ROOT: plan.comfyDir,
        COMFYUI_PYTHON: venvPython(plan.comfyDir),
        COMFY_MODE: 'local',
        COMFY_TIER: plan.tier.id,
        ...plan.tier.mcpEnv
      };
      installMcp(run_ctx, plan, env);
      ctx.setProjectEnv?.('COMFY_MODE', 'local');
      ctx.setProjectEnv?.('COMFY_TIER', plan.tier.id);
      if (plan.failed) console.log(`\n⚠️  ${plan.failed} model download(s) failed. Re-run to resume them: node setup/comfyui-setup.mjs --comfyui=local --tier=${plan.tier.id}`);
    } else {
      const env = { COMFY_MODE: 'cloud', COMFY_CLOUD_URL: 'https://cloud.comfy.org' };
      if (plan.apiKey) env.COMFY_CLOUD_API_KEY = plan.apiKey;
      installMcp(run_ctx, plan, env);
      ctx.setProjectEnv?.('COMFY_MODE', 'cloud');
      if (!plan.apiKey) console.log(`  ⚠️  No API key yet: add COMFY_CLOUD_API_KEY=... to ${path.join(plan.mcpDir, '.env')}`);
    }
  } catch (err) {
    console.error(`\n❌ ComfyUI setup stopped: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Standalone: node setup/comfyui-setup.mjs
// ---------------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cliArgs = process.argv.slice(2);
  const projectDir = process.cwd();
  const envFile = path.join(projectDir, '.env');
  const readEnv = key => {
    const line = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf-8').split(/\r?\n/).find(l => l.startsWith(`${key}=`)) : null;
    return line ? line.slice(key.length + 1).trim() : null;
  };
  const assumeYes = cliArgs.includes('--yes') || cliArgs.includes('-y');
  const interactive = Boolean(process.stdin.isTTY) && !assumeYes && !cliArgs.includes('--no-prompt');
  const rl = interactive ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
  const defaultRoot = path.join(os.homedir(), 'ComfyUI');
  let comfyRoot = flagValue(cliArgs, 'root') ?? process.env.COMFYUI_ROOT ?? readEnv('COMFYUI_ROOT');
  if (!comfyRoot && rl) comfyRoot = (await rl.question(`Folder of ComfyUI [${defaultRoot}] `)).trim().replace(/^["']|["']$/g, '') || defaultRoot;
  comfyRoot = path.resolve(comfyRoot ?? defaultRoot);

  const ctx = { rl, interactive, assumeYes, cliArgs, comfyRoot, projectDir, dryRun: cliArgs.includes('--dry-run') };
  const plan = await planComfyUI(ctx);
  rl?.close();
  await runComfyUIPlan(plan, {
    setProjectEnv: (key, value) => {
      if (!ctx.dryRun && fs.existsSync(envFile)) writeEnvFile(envFile, { [key]: value, COMFYUI_ROOT: comfyRoot });
    }
  });
}
