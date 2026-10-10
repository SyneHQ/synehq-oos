import assert from "node:assert/strict";
import { applicationPath } from "../apps/web/src/paths";
import { serverBasePath } from "../apps/web/src/server/auth";
import { createRequestHandler } from "../apps/web/src/server/runtime";

process.env.AUTH_URL = "http://localhost:3100";
const basePath = serverBasePath();
const handler = createRequestHandler({ isReady: () => true });
const assets = new Set<string>([
  applicationPath("/monaco/vs/loader.js", basePath),
  applicationPath("/monaco/vs/editor/editor.main.js", basePath),
  applicationPath("/auth-portrait.jpg", basePath),
]);

for (const route of ["/", "/login/", "/setup/", "/connections/", "/explorer/fixture/console"]) {
  const path = applicationPath(route, basePath);
  const result = await handler(new Request(`http://localhost:3100${path}`));
  assert.equal(result.status, 200, path);
  assert.match(result.headers.get("content-type") ?? "", /text\/html/);
  const html = await result.text();
  let scripts = 0;
  for (const match of html.matchAll(/(?:src|href)="(\/[^"?#]+)(?:\?[^"#]*)?"/g)) {
    const asset = match[1];
    if (!/\.(?:js|css|png|jpg|svg|woff2?)$/.test(asset)) continue;
    assert.ok(asset.startsWith(`${basePath}/`), `Asset escaped the mount: ${asset}`);
    if (asset.endsWith(".js")) scripts++;
    assets.add(asset);
  }
  assert.ok(scripts > 0, `No application scripts found in ${path}`);
}

for (const asset of assets) {
  const result = await handler(new Request(`http://localhost:3100${asset}`));
  assert.equal(result.status, 200, asset);
  assert.ok((await result.arrayBuffer()).byteLength > 0, asset);
}
if (basePath) {
  for (const path of ["/login/", "/connections/", "/api/session", "/monaco/vs/loader.js"])
    assert.equal((await handler(new Request(`http://localhost:3100${path}`))).status, 404, path);
}
console.log(`Static build passed for ${basePath || "/"}: five routes and ${assets.size} assets.`);
