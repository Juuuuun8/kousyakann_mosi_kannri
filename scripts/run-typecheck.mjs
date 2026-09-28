import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagesRoot = path.join(repoRoot, "packages");
const tsc = path.join(repoRoot, "node_modules", "typescript", "bin", "tsc");

async function discover(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const configs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const child = path.join(directory, entry.name);
    try {
      const names = await readdir(child);
      if (names.includes("tsconfig.json")) configs.push(path.join(child, "tsconfig.json"));
      else configs.push(...await discover(child));
    } catch {
      // Unreadable directories cannot contain a usable project configuration.
    }
  }
  return configs;
}

const configs = (await discover(packagesRoot)).sort();
if (configs.length === 0) throw new Error("no TypeScript projects found");

for (const config of configs) {
  process.stdout.write(`[TYPECHECK] ${path.relative(repoRoot, path.dirname(config))}\n`);
  const run = spawnSync(process.execPath, [tsc, "--project", config, "--pretty", "false"], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
  });
  if (run.error) throw run.error;
  if (run.status !== 0) process.exit(run.status ?? 1);
}

process.stdout.write(`TypeScript checks passed for ${configs.length} projects.\n`);
