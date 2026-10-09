import { build } from "esbuild";
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { brotliCompress, gzip, constants } from "node:zlib";
import { promisify } from "node:util";

const brotli = promisify(brotliCompress);
const compressGzip = promisify(gzip);
async function compressStatic(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await compressStatic(path);
    else if (entry.isFile() && /\.(html|js|mjs|css|json|svg|txt)$/.test(extname(path))) {
      const data = await readFile(path);
      if (data.length < 1024) continue;
      for (const [suffix, compressed] of [
        ["br", await brotli(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 6 } })],
        ["gz", await compressGzip(data, { level: 9 })],
      ])
        if (compressed.length < data.length) await writeFile(`${path}.${suffix}`, compressed);
    }
  }
}

await mkdir("dist", { recursive: true });
await build({
  entryPoints: {
    server: "deploy/serve.ts",
    container: "deploy/container.ts",
    operator: "apps/web/scripts/operator.ts",
  },
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  platform: "node",
  target: "node24",
  format: "esm",
  bundle: true,
  external: ["@prisma/client"],
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
  legalComments: "linked",
  minify: true,
  sourcemap: false,
  metafile: true,
}).then(async ({ metafile }) => {
  const { writeFile } = await import("node:fs/promises");
  await writeFile("dist/metafile.json", JSON.stringify(metafile, null, 2));
});
await cp("apps/web/prisma/migrations", "dist/migrations", { recursive: true });
await compressStatic("apps/web/out");
