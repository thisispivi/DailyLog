// Copies the static files the GitHub Pages demo needs into demo/public.
import { copyFile, mkdir, writeFile } from "node:fs/promises";

const domain = "demo.dailylog.pivi.dev";

await mkdir("demo/public", { recursive: true });
// sql.js is served as a plain script with its WebAssembly binary next to it.
await copyFile("node_modules/sql.js/dist/sql-wasm.js", "demo/public/sql-wasm.js");
await copyFile("node_modules/sql.js/dist/sql-wasm.wasm", "demo/public/sql-wasm.wasm");
await copyFile("src/app/icon.svg", "demo/public/icon.svg");
await writeFile("demo/public/CNAME", `${domain}\n`);
// Without this, GitHub Pages runs Jekyll and drops the _next folder.
await writeFile("demo/public/.nojekyll", "");
