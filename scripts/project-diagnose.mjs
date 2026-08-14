import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

const requiredFiles = [
  "package.json",
  "next.config.ts",
  "src/app",
  "src/domain",
];

const envNames = existsSync(".env.local")
  ? new Set(
      readFileSync(".env.local", "utf8")
        .split(/\r?\n/)
        .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
        .filter(Boolean),
    )
  : new Set();

const requiredEnvironment = ["DATABASE_URL"];
const missingFiles = requiredFiles.filter((path) => !existsSync(path));
const missingEnvironment = requiredEnvironment.filter(
  (name) => !process.env[name] && !envNames.has(name),
);

console.log(`Node: ${process.version}`);
console.log(`Project files: ${missingFiles.length ? `missing ${missingFiles.join(", ")}` : "ok"}`);
console.log(
  `Local environment: ${missingEnvironment.length ? `missing ${missingEnvironment.join(", ")}` : "ok"}`,
);
console.log(`Next.js cache: ${existsSync(".next") ? "present" : "clean"}`);

if (missingFiles.length || missingEnvironment.length) {
  process.exitCode = 1;
}
