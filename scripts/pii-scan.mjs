import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
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
const ignoredDirectories = new Set([".git", "node_modules", "tmp", "temp", "dist", "coverage"]);
const textExtensions = new Set([".js", ".mjs", ".ts", ".json", ".md", ".html", ".css", ".yml", ".yaml"]);
const secretPatterns = [
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u, "private key"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/u, "GitHub token"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/u, "GitHub fine-grained token"],
  [/\bAIza[0-9A-Za-z_-]{30,}\b/u, "Google API key"],
  [/\bAKIA[0-9A-Z]{16}\b/u, "AWS access key"],
  [/(?:HMAC_SECRET|GAS_ENDPOINT|CLIENT_SECRET|PRIVATE_KEY)\s*[:=]\s*["'][^"'\s]{8,}["']/u, "configured secret"],
];
const forbiddenBrowserStorage = /\b(?:localStorage|sessionStorage|indexedDB)\b/u;
const forbiddenDataExtensions = new Set([".pdf", ".docx", ".xlsx", ".xlsm", ".xls", ".csv", ".tsv"]);

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
  if (forbiddenDataExtensions.has(extension)) findings.push(`${relative}: forbidden file extension ${extension}`);
  if (!textExtensions.has(extension)) continue;
  const contents = await readFile(file, "utf8");
  for (const token of blockedTokens) if (contents.includes(token)) findings.push(`${relative}: blocked sample token detected`);
  for (const [pattern, label] of secretPatterns) if (pattern.test(contents)) findings.push(`${relative}: possible ${label}`);
  const sourcePath = relative.replaceAll("\\", "/");
  if ((sourcePath.startsWith("packages/") || sourcePath.startsWith("functions/")) && !sourcePath.includes("/test/") && forbiddenBrowserStorage.test(contents)) {
    findings.push(`${relative}: forbidden browser persistence API in application source`);
  }
}

if (process.argv.includes("--history")) {
  const history = spawnSync("git", ["log", "--all", "--name-only", "--pretty=format:"], { cwd: repoRoot, encoding: "utf8", shell: false });
  if (history.error || history.status !== 0) findings.push("git history could not be inspected");
  else {
    const historicalPaths = new Set(history.stdout.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean));
    for (const historicalPath of historicalPaths) {
      if (forbiddenDataExtensions.has(path.extname(historicalPath).toLowerCase())) findings.push(`${historicalPath}: forbidden data file exists in Git history`);
      if (/^(?:\.env(?:\.|$)|.*(?:credentials|service-account).*\.json$)/iu.test(historicalPath)) findings.push(`${historicalPath}: secret-bearing filename exists in Git history`);
    }
  }
  for (const token of blockedTokens) {
    const search = spawnSync("git", ["log", "--all", "--format=", `-S${token}`, "--name-only", "--", "."], { cwd: repoRoot, encoding: "utf8", shell: false });
    if (search.error || search.status !== 0) findings.push("git history content scan failed");
    else if (search.stdout.trim()) findings.push("blocked sample token detected in Git history");
  }
}

if (findings.length > 0) {
  for (const finding of findings) console.error(finding);
  process.exitCode = 1;
} else {
  console.log("Security scan passed: no blocked samples, secrets, forbidden persistence, or forbidden data files found.");
}
