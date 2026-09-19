import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import { chromium, type Browser, type Page } from 'playwright-core'

const appDir = resolve(import.meta.dir, '..')
const usage = `Usage: bun run newframe preview:component /absolute/fixture.tsx
  [--screenshot /absolute/output.png] [--check /absolute/check.ts]
  [--width 420] [--height 900] [--browser /absolute/chromium]
Without --screenshot, serves until Ctrl-C. --check requires --screenshot.`

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      screenshot: { type: 'string' },
      check: { type: 'string' },
      browser: { type: 'string' },
      width: { type: 'string', default: '420' },
      height: { type: 'string', default: '900' },
      help: { type: 'boolean' }
    }
  })
  if (values.help) {
    return console.log(usage)
  }
  const fixture = positionals[0]
  if (positionals.length !== 1 || !fixture) {
    throw new Error(usage)
  }
  for (const path of [fixture, values.check, values.screenshot, values.browser]) {
    if (path && !isAbsolute(path)) {
      throw new Error(`Use an absolute path: ${path}`)
    }
  }
  if (values.check && !values.screenshot) {
    throw new Error('--check requires --screenshot')
  }
  const width = Number(values.width)
  const height = Number(values.height)
  if (![width, height].every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw new Error('--width and --height must be positive integers')
  }
  if (values.screenshot) {
    if (!values.screenshot.endsWith('.png')) {
      throw new Error('--screenshot must end in .png')
    }
    if (
      [fixture, values.check, values.browser].some(
        (path) => path && resolve(path) === resolve(values.screenshot!)
      )
    ) {
      throw new Error('--screenshot must differ from fixture, check, and browser paths')
    }
    // A failed run must not leave an earlier screenshot looking like fresh evidence.
    await rm(values.screenshot, { force: true })
  }
  for (const path of [fixture, values.check]) {
    if (path && !(await Bun.file(path).exists())) {
      throw new Error(`File not found: ${path}`)
    }
  }

  const directory = await mkdtemp(join(tmpdir(), 'newframe-component-preview-'))
  const stopped = new AbortController()
  let browser: Browser | undefined
  let server: ReturnType<typeof Bun.serve> | undefined
  let child: Bun.Subprocess | undefined
  const errors = new Set<string>()
  const stop = () => {
    stopped.abort(new Error('Preview interrupted'))
    child?.kill()
    void browser?.close().catch(() => {})
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  try {
    for (const script of ['ui:build', 'styles:generate']) {
      stopped.signal.throwIfAborted()
      child = Bun.spawn([process.execPath, 'run', script], {
        cwd: appDir,
        env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
        stdout: 'inherit',
        stderr: 'inherit'
      })
      if ((await child.exited) !== 0) {
        throw new Error(`${script} failed`)
      }
      child = undefined
    }
    stopped.signal.throwIfAborted()
    const entry = join(directory, 'entry.tsx')
    await writeFile(
      entry,
      `
import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { UIRoot } from '@newframe/ui/root'
import Fixture from ${JSON.stringify(fixture)}
import ${JSON.stringify(join(appDir, 'generated/styled-system/styles.css'))}
function Preview() {
  useEffect(() => { document.documentElement.dataset.previewReady = 'true' }, [])
  return <UIRoot><Fixture /></UIRoot>
}
createRoot(document.getElementById('preview')).render(<Preview />)
`
    )
    const html = join(directory, 'index.html')
    await writeFile(
      html,
      `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:,"><title>Component preview</title>
<style>html,body,#preview{height:100%;width:100%;margin:0}</style>
</head><body class="dark"><div id="preview"></div><script type="module" src="./entry.tsx"></script></body></html>`
    )
    const outdir = join(directory, 'build')
    const result = await Bun.build({
      entrypoints: [html],
      outdir,
      target: 'browser',
      reactCompiler: true,
      minify: true,
      define: { global: 'globalThis', 'process.env.NODE_ENV': JSON.stringify('production') },
      plugins: [
        {
          name: 'preview-imports',
          setup(build) {
            build.onResolve({ filter: /^[^./]/ }, ({ path, importer }) => {
              if (isAbsolute(path) || path.includes(':')) {
                return
              }
              if (importer === fixture || importer === entry) {
                return { path: Bun.resolveSync(path, appDir) }
              }
              // Leave transitive packages to Bun's browser resolver. Only missing
              // imports in temporary helpers fall back to the app's dependencies.
              try {
                Bun.resolveSync(path, dirname(importer))
              } catch {
                return { path: Bun.resolveSync(path, appDir) }
              }
            })
          }
        }
      ]
    })
    if (!result.success) {
      throw new Error(`Preview build failed:\n${result.logs.map((log) => log.message).join('\n')}`)
    }
    stopped.signal.throwIfAborted()
    const outputs = new Map(result.outputs.map((output) => [`/${relative(outdir, output.path)}`, output]))
    const index = result.outputs.find((output) => output.path.endsWith('.html'))
    if (!index) {
      throw new Error('Preview build produced no HTML')
    }
    outputs.set('/', index)
    server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch(request) {
        const output = outputs.get(new URL(request.url).pathname)
        if (!output || !['GET', 'HEAD'].includes(request.method)) {
          return new Response('Not found', { status: 404 })
        }
        return new Response(request.method === 'HEAD' ? null : output, {
          headers: { 'Content-Type': output.type, 'Cache-Control': 'no-store' }
        })
      }
    })
    const url = server.url.href
    console.log(`Component preview: ${url}`)
    if (!values.screenshot) {
      stopped.signal.throwIfAborted()
      await new Promise<void>((done) =>
        stopped.signal.addEventListener('abort', () => done(), { once: true })
      )
      return
    }
    try {
      browser = await chromium.launch({ executablePath: values.browser, headless: true })
    } catch (error) {
      throw new Error(
        'Chromium unavailable. Pass --browser /absolute/path/to/an/installed/chromium. No browser is downloaded.',
        { cause: error }
      )
    }
    stopped.signal.throwIfAborted()
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      colorScheme: 'dark',
      reducedMotion: 'reduce',
      locale: 'en-US',
      timezoneId: 'UTC',
      serviceWorkers: 'block'
    })
    await context.route('**/*', async (route) => {
      const requestUrl = route.request().url()
      if (new URL(requestUrl).origin === new URL(url).origin) {
        return route.continue()
      }
      errors.add(`External request blocked: ${requestUrl}. Use local fixture data/assets.`)
      await route.abort()
    })
    const page = await context.newPage()
    page.on('pageerror', (error) => errors.add(error.message))
    page.on('requestfailed', (request) =>
      errors.add(`Request failed: ${request.url()} (${request.failure()?.errorText})`)
    )
    page.on('response', (response) => {
      if (response.status() >= 400) {
        errors.add(`HTTP ${response.status()}: ${response.url()}`)
      }
    })
    const assertHealthy = () => {
      stopped.signal.throwIfAborted()
      if (errors.size) {
        throw new Error('Browser reported errors')
      }
    }
    await page.goto(url, { waitUntil: 'load' })
    await page.locator('html[data-preview-ready="true"]').waitFor({ state: 'attached' })
    assertHealthy()
    if (values.check) {
      const check: { default?: (page: Page) => Promise<void> } = await import(
        pathToFileURL(values.check).href
      )
      if (typeof check.default !== 'function') {
        throw new Error('--check must default-export an async (page: Page) => void function')
      }
      await check.default(page)
    }
    await page.evaluate(async () => {
      await document.fonts.ready
      await Promise.all(Array.from(document.images, (image) => image.decode()))
      await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())))
    })
    assertHealthy()
    const screenshot = await page.screenshot({ type: 'png', animations: 'disabled' })
    assertHealthy()
    await mkdir(dirname(values.screenshot), { recursive: true })
    await writeFile(values.screenshot, screenshot)
    console.log(`Screenshot: ${values.screenshot}`)
  } catch (error) {
    if (errors.size) {
      throw new Error(`Preview failed:\n${[...errors].join('\n')}`, { cause: error })
    }
    throw error
  } finally {
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
    await Promise.allSettled([browser?.close(), server?.stop(true)])
    await rm(directory, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
