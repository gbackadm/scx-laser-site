import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

function loadLocalEnv() {
  if (!existsSync(".env.local")) {
    return;
  }

  const lines = readFileSync(".env.local", "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^([^#][^=]+)=(.+)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

loadLocalEnv();

const id = getArg("--id");
const token = process.env.OLIST_API_TOKEN ?? process.env.TINY_API_TOKEN;

if (!id) {
  console.error("Use --id ID_DO_PRODUTO.");
  process.exit(1);
}

if (!token) {
  console.error("OLIST_API_TOKEN or TINY_API_TOKEN is required.");
  process.exit(1);
}

const response = await fetch("https://api.tiny.com.br/api2/produto.obter.php", {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: new URLSearchParams({
    token,
    id,
    formato: "JSON",
  }),
});

console.log(await response.text());
