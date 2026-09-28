import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagesRoot = path.join(repoRoot, "packages");

async function discover(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const manifests = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(directory, entry.name, "package.json");
    try {
      await readFile(candidate, "utf8");
      manifests.push(candidate);
    } catch {
      manifests.push(...await discover(path.join(directory, entry.name)));
    }
  }
  return manifests;
}

const manifests = (await discover(packagesRoot)).sort();
if (manifests.length === 0) throw new Error("no package manifests found");

for (const manifest of manifests) {
  const parsed = JSON.parse(await readFile(manifest, "utf8"));
  if (typeof parsed.scripts?.test !== "string") continue;
  process.stdout.write(`\n[TEST] ${parsed.name}\n`);
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("npm_execpath is unavailable; run this script through npm");
  const run = spawnSync(process.execPath, [npmCli, "test", "--silent"], {
    cwd: path.dirname(manifest),
    stdio: "inherit",
    shell: false,
  });
  if (run.error) throw run.error;
  if (run.status !== 0) process.exit(run.status ?? 1);
}

process.stdout.write(`\nAll ${manifests.length} package test suites passed.\n`);
