import { copyFile, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "packages", "frontend-prototype");
const destination = path.join(root, "dist");

if (!destination.startsWith(`${root}${path.sep}`)) throw new Error("demo output must stay inside repository");
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, {
  recursive: true,
  filter: (item) => !path.relative(source, item).split(path.sep).includes("test") && !item.endsWith("package.json"),
});
await copyFile(path.join(source, "index.html"), path.join(destination, "dashboard.html"));
await copyFile(path.join(source, "login.html"), path.join(destination, "index.html"));
process.stdout.write(`Static demo built at ${destination}\n`);
