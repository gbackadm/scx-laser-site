import { existsSync, rmSync } from "node:fs";
import { resolve, sep } from "node:path";

const projectRoot = resolve(process.cwd());
const generatedDirectory = resolve(projectRoot, ".next");

if (!generatedDirectory.startsWith(`${projectRoot}${sep}`)) {
  throw new Error("Refusing to remove a directory outside the project.");
}

if (!existsSync(generatedDirectory)) {
  console.log("Next.js cache is already clean.");
  process.exit(0);
}

rmSync(generatedDirectory, { recursive: true, force: true });
console.log("Removed the generated .next directory.");
