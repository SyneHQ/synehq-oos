import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";

const require = createRequire(import.meta.url);
const source = join(dirname(require.resolve("monaco-editor/package.json")), "min", "vs");
const prepareScript = fileURLToPath(
  new URL("../apps/web/scripts/prepare-editor.mjs", import.meta.url),
);
let destination: string;

before(async () => {
  destination = await mkdtemp(join(tmpdir(), "syneoss-editor-assets-"));
  execFileSync(process.execPath, [prepareScript, destination], { stdio: "pipe" });
});

after(async () => {
  if (destination) await rm(destination, { recursive: true, force: true });
});

function delayedModules() {
  type Factory = (...dependencies: unknown[]) => void;
  const modules = new Map<string, Factory>();
  const context = createContext({
    define: (name: string, _dependencies: string[], factory: Factory) => modules.set(name, factory),
  });
  const registered: string[] = [];
  const editorApi = {
    Emitter: class {
      event = () => {};
      fire() {}
    },
    languages: {
      register: ({ id }: { id: string }) => registered.push(id),
      registerTokensProviderFactory() {},
      onLanguageEncountered() {},
      onLanguage() {},
    },
  };
  return { context, modules, editorApi, registered };
}

test("Monaco AMD factories keep their own helpers when script loading overlaps", async () => {
  const yaml = (await readdir(source)).find((name) => /^yaml\.contribution\..+\.js$/.test(name));
  assert.ok(yaml, "The pinned Monaco package must contain its YAML contribution.");
  const css = "language/css/monaco.contribution.js";
  const files = [css, yaml];
  const original = delayedModules();
  for (const file of files) {
    runInContext(await readFile(join(source, file), "utf8"), original.context, { filename: file });
  }
  const rawCssFactory = original.modules.get("vs/language/css/monaco.contribution");
  assert.ok(rawCssFactory);
  assert.throws(() => rawCssFactory(() => {}, {}, original.editorApi), {
    name: "TypeError",
    message: /Property description must be an object/,
  });

  for (const order of [files, [...files].reverse()]) {
    const prepared = delayedModules();
    for (const file of order) {
      runInContext(await readFile(join(destination, file), "utf8"), prepared.context, {
        filename: file,
      });
    }
    const exports: Record<string, { languageId: string }> = {};
    const cssFactory = prepared.modules.get("vs/language/css/monaco.contribution");
    const yamlFactory = prepared.modules.get(`vs/${yaml.slice(0, -3)}`);
    assert.ok(cssFactory);
    assert.ok(yamlFactory);
    cssFactory(() => {}, exports, prepared.editorApi);
    yamlFactory(() => {}, prepared.editorApi);
    assert.equal(exports.cssDefaults.languageId, "css");
    assert.equal(exports.scssDefaults.languageId, "scss");
    assert.equal(exports.lessDefaults.languageId, "less");
    assert.ok(prepared.registered.includes("sql"));
    assert.ok(prepared.registered.includes("yaml"));
    assert.equal(runInContext("typeof m", prepared.context), "undefined");
    assert.equal(runInContext("typeof r", prepared.context), "undefined");
  }
});

test("the Monaco loader still exposes global AMD define and require", async () => {
  const original = await readFile(join(source, "loader.js"), "utf8");
  const copied = await readFile(join(destination, "loader.js"), "utf8");
  assert.equal(copied, original);
  const context = createContext({ setTimeout, clearTimeout, console });
  runInContext(copied, context, { filename: "loader.js" });
  assert.equal(runInContext("typeof define", context), "function");
  assert.equal(runInContext("typeof require", context), "function");
  assert.equal(runInContext("typeof define.amd", context), "object");
  runInContext(
    "define('editor-asset-check', [], function () { return 42; }); require(['editor-asset-check'], function (value) { globalThis.loadedValue = value; });",
    context,
  );
  assert.equal(runInContext("loadedValue", context), 42);
});

test("asset preparation preserves worker scripts and AMD source including worker URLs", async () => {
  for (const name of await readdir(join(source, "assets"))) {
    if (!name.endsWith(".js")) continue;
    assert.deepEqual(
      await readFile(join(destination, "assets", name)),
      await readFile(join(source, "assets", name)),
      `Worker ${name} must remain unchanged.`,
    );
  }
  const main = "editor/editor.main.js";
  assert.equal(
    await readFile(join(destination, main), "utf8"),
    `;(function () {\n${await readFile(join(source, main), "utf8")}\n}).call(globalThis);\n`,
  );
});
