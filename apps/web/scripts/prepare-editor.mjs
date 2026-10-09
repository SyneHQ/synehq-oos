import { cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const source = join(dirname(require.resolve("monaco-editor/package.json")), "min", "vs");
const destination = new URL("../public/monaco/vs/", import.meta.url);
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true, force: true });
