import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const blockedTokens = [
  ["609", "1448"].join(""),
  ["011", "23"].join(""),
  ["266062", "011", "23"].join(""),
  ["000015", "8915"].join(""),
  ["サイト", "ウ"].join(""),
  ["カノ", "ン"].join(""),
  ["札幌", "旭丘"].join(""),
];
const blockedExtensions = new Set([".pdf", ".xlsx", ".xls", ".csv", ".tsv"]);
const ignoredDirectories = new Set([".git", "node_modules"]);
const textExtensions = new Set([".js", ".mjs", ".ts", ".json", ".md", ".html", ".css", ".yml", ".yaml"]);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) files.push(...await walk(path.join(directory, entry.name)));
      continue;
    }
    files.push(path.join(directory, entry.name));
  }
  return files;
}

const findings = [];
for (const file of await walk(repoRoot)) {
  const relative = path.relative(repoRoot, file);
  const extension = path.extname(file).toLowerCase();
  if (blockedExtensions.has(extension)) findings.push(`${relative}: forbidden file extension ${extension}`);
  if (!textExtensions.has(extension)) continue;
  const contents = await readFile(file, "utf8");
  for (const token of blockedTokens) if (contents.includes(token)) findings.push(`${relative}: blocked sample token detected`);
}

if (findings.length > 0) {
  for (const finding of findings) console.error(finding);
  process.exitCode = 1;
} else {
  console.log("PII scan passed: no blocked sample tokens or forbidden data files found.");
}
