import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "packages", "frontend-prototype");
const destination = path.join(root, "dist");

if (!destination.startsWith(`${root}${path.sep}`)) throw new Error("demo output must stay inside repository");
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true, filter: (item) => !item.includes(`${path.sep}test${path.sep}`) && !item.endsWith("package.json") });
process.stdout.write(`Static demo built at ${destination}\n`);
