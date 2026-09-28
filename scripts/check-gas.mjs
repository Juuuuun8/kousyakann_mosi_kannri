import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(path.join(root, "gas", "Code.gs"), "utf8");
new Script(source, { filename: "gas/Code.gs" });

for (const required of ["function doPost", "function ensureSchema", "parseEnvelope_", "consumeNonce_", "authChallenge_", "authComplete_", "authenticate_", "LockService.getScriptLock", "computeHmacSha256Signature"]) {
  if (!source.includes(required)) throw new Error(`GAS runtime is missing required boundary: ${required}`);
}
for (const forbidden of ["Logger.log", "console.log", "CacheService", "getActiveSpreadsheet(", "passwordPlaintext"]) {
  if (source.includes(forbidden)) throw new Error(`GAS runtime contains forbidden construct: ${forbidden}`);
}
process.stdout.write("GAS syntax and static security boundary checks passed.\n");
