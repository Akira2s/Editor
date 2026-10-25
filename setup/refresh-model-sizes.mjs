#!/usr/bin/env node
// Fills `sizeBytes` (and `sha256` where the host publishes one) for every model in comfyui-tiers.json.
//   node setup/refresh-model-sizes.mjs          only models that have no size yet
//   node setup/refresh-model-sizes.mjs --all    every model again
// Read-only against the hosts: it lists repository files / sends HEAD requests and downloads nothing.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const manifestPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'comfyui-tiers.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
const all = process.argv.includes('--all');
const treeCache = new Map();

async function hfFile(repo, filePath) {
  if (!treeCache.has(repo)) {
    const res = await fetch(`https://huggingface.co/api/models/${repo}/tree/main?recursive=1`);
    if (!res.ok) throw new Error(`HTTP ${res.status} listing ${repo}`);
    treeCache.set(repo, await res.json());
  }
  const file = treeCache.get(repo).find(f => f.type === 'file' && f.path === filePath);
  if (!file) throw new Error(`${filePath} not found in ${repo}`);
  const sha = file.lfs?.oid;
  return { sizeBytes: file.lfs?.size ?? file.size, sha256: sha && /^[0-9a-f]{64}$/.test(sha) ? sha : undefined };
}

async function modelscopeFile(repo, filePath) {
  const url = `https://www.modelscope.ai/api/v1/models/${repo}/repo?Revision=master&FilePath=${encodeURIComponent(filePath)}`;
  const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
  const size = Number(res.headers.get('content-length'));
  if (!res.ok || !size) throw new Error(`HTTP ${res.status} for ${repo}/${filePath}`);
  return { sizeBytes: size };
}

let failed = 0;
for (const [id, model] of Object.entries(manifest.models)) {
  if (!all && model.sizeBytes) continue;
  try {
    const { type, repo, path: filePath } = model.source;
    const info = type === 'hf' ? await hfFile(repo, filePath) : await modelscopeFile(repo, filePath);
    model.sizeBytes = info.sizeBytes;
    if (info.sha256) model.sha256 = info.sha256;
    else delete model.sha256;
    console.log(`  ✅ ${id}: ${(info.sizeBytes / 1e9).toFixed(3)} GB${info.sha256 ? '' : '  (no checksum published)'}`);
  } catch (err) {
    failed++;
    console.log(`  ❌ ${id}: ${err.message}`);
  }
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
process.exit(failed ? 1 : 0);
