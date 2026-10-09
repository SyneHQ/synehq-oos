# Editor assets

The app serves Monaco from `/monaco/vs`. It uses `monaco-editor` 0.53.0 under the MIT license. The source is the installed package's `min/vs` directory. The app does not load editor files from a public CDN.

`apps/web/scripts/prepare-editor.mjs` copies these files before development or a build. It wraps each named AMD module in a function. Monaco 0.53.0 places some helper variables before its `define` call. Without the wrapper, another script can replace those variables before the module factory runs. This can stop the SQL and JSON editors from loading.

The wrapper gives each script a separate variable scope. It keeps the global `define` and `require` functions available. It preserves the module body, module names, license text, and worker URLs. The script copies `loader.js` and the worker bundles without changes.

The preparation command accepts an optional output directory. Tests use a temporary directory so they do not change public assets. The regression check loads the real CSS and YAML contributions before it runs their factories. It checks both script orders, the loader's global functions, and unchanged worker files.

Review this transformation when the Monaco version changes. A source check must confirm that the new package still uses named AMD modules. A browser check must confirm that both SQL and JSON editors load and that their workers start.
