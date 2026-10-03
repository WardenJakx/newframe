import { readFile } from 'node:fs/promises'

import type { BunPlugin } from 'bun'

/** bc-ur expects a callable CommonJS assert; Bun's browser shim exports a namespace. */
export const browserPolyfills: BunPlugin = {
  name: 'bc-ur-browser-polyfills',
  setup(build) {
    build.onLoad(
      { filter: /[/\\](?:@ngraveio[/\\]bc-ur[/\\]dist|cbor-sync)[/\\].*\.js$/ },
      async ({ path }) => ({
        // Both packages use Buffer as a global. cbor-sync checks it during module initialization.
        contents: `var Buffer = require("buffer").Buffer;\n${await readFile(path, 'utf8')}`,
        loader: 'js'
      })
    )
    build.onResolve({ filter: /^assert$/ }, ({ importer }) => {
      if (/[/\\]@ngraveio[/\\]bc-ur[/\\]/.test(importer)) {
        return { path: 'assert', namespace: 'bc-ur-browser-assert' }
      }
    })
    build.onLoad({ filter: /^assert$/, namespace: 'bc-ur-browser-assert' }, () => ({
      contents: 'export { ok as default } from "node:assert"',
      loader: 'js'
    }))
  }
}
