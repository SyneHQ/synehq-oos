import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const source = join(dirname(require.resolve("monaco-editor/package.json")), "min", "vs");
const destination = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL("../public/monaco/vs/", import.meta.url));
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true, force: true });

// Monaco 0.53.0 emits shared helper names before its named AMD registrations.
// Isolate each file so a later script cannot change a delayed factory's helpers.
const namedModule = /(?:^|;)\s*define\s*\(\s*["']vs\/[^"']+["']\s*,/;
async function isolateModules(directory, relativePath = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativeFile = join(relativePath, entry.name);
    const inputFile = join(directory, entry.name);
    if (entry.isDirectory()) {
      await isolateModules(inputFile, relativeFile);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".js") || relativeFile === "loader.js") continue;
    const contents = await readFile(inputFile, "utf8");
    // Worker bundles contain methods named define. Only named AMD calls qualify.
    if (!namedModule.test(contents)) continue;
    await writeFile(
      join(destination, relativeFile),
      `;(function () {\n${contents}\n}).call(globalThis);\n`,
    );
  }
}

await isolateModules(source);
