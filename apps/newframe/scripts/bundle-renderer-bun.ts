import { dirname, join, relative, resolve } from 'path'
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'fs/promises'

type Renderer = {
  entrypoint: string
  name: string
}

const cwd = process.cwd()
const bundleDir = resolve(cwd, 'bundle')
const tempRoot = resolve(bundleDir, '.bun-renderer')

const renderers: Record<string, Renderer> = {
  tray: { name: 'tray', entrypoint: 'app/tray/index.html' },
  sidetray: { name: 'sidetray', entrypoint: 'app/sidetray/index.html' }
}

function extractScriptNonce(html: string, entrypoint: string) {
  const match = html.match(/<script\b[^>]*\bnonce="([^"]+)"/i)

  if (!match) {
    throw new Error(`Could not find script nonce in ${entrypoint}`)
  }

  return match[1]
}

function restoreScriptNonce(html: string, nonce: string) {
  return html.replace(/<script\b(?![^>]*\bnonce=)([^>]*)>/gi, `<script nonce="${nonce}"$1>`)
}

async function walkFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir)
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(dir, entry)
      const stats = await stat(fullPath)

      if (stats.isDirectory()) {
        return walkFiles(fullPath)
      }

      return [fullPath]
    })
  )

  return files.flat()
}

async function copyBuildAssets(tempDir: string, generatedHtmlPath: string) {
  const files = await walkFiles(tempDir)

  for (const file of files) {
    if (file === generatedHtmlPath) continue

    const destination = resolve(bundleDir, relative(tempDir, file))
    await mkdir(dirname(destination), { recursive: true })
    await copyFile(file, destination)
  }
}

async function findGeneratedHtml(tempDir: string, result: Bun.BuildOutput) {
  const outputHtml = result.outputs.find((output) => output.path.endsWith('.html'))

  if (outputHtml) {
    return outputHtml.path
  }

  const htmlFiles = (await walkFiles(tempDir)).filter((file) => file.endsWith('.html'))

  if (htmlFiles.length !== 1) {
    throw new Error(`Expected one generated HTML file in ${tempDir}, found ${htmlFiles.length}`)
  }

  return htmlFiles[0]
}

async function buildRenderer(renderer: Renderer) {
  const entrypoint = resolve(cwd, renderer.entrypoint)
  const tempDir = join(tempRoot, renderer.name)

  await rm(tempDir, { recursive: true, force: true })
  await mkdir(tempDir, { recursive: true })
  await mkdir(bundleDir, { recursive: true })

  const result = await Bun.build({
    entrypoints: [entrypoint],
    outdir: tempDir,
    target: 'browser',
    minify: true,
    define: {
      global: 'globalThis',
      'process.env.NODE_ENV': JSON.stringify('production')
    },
    naming: {
      entry: `${renderer.name}-[name]-[hash].[ext]`,
      chunk: `${renderer.name}-[name]-[hash].[ext]`,
      asset: '[name]-[hash].[ext]'
    }
  })

  if (!result.success) {
    console.error(result.logs)
    process.exit(1)
  }

  const generatedHtmlPath = await findGeneratedHtml(tempDir, result)
  const sourceHtml = await readFile(entrypoint, 'utf8')
  const generatedHtml = await readFile(generatedHtmlPath, 'utf8')
  const nonce = extractScriptNonce(sourceHtml, renderer.entrypoint)
  const finalHtml = restoreScriptNonce(generatedHtml, nonce)

  await copyBuildAssets(tempDir, generatedHtmlPath)
  await writeFile(join(bundleDir, `${renderer.name}.html`), finalHtml)
  await rm(tempDir, { recursive: true, force: true })

  console.log(`Built ${renderer.name} with Bun`)
}

async function main() {
  const targets = process.argv.slice(2)
  const selected = targets.length > 0 ? targets : Object.keys(renderers)

  for (const target of selected) {
    const renderer = renderers[target]

    if (!renderer) {
      throw new Error(`Unknown renderer "${target}". Expected one of: ${Object.keys(renderers).join(', ')}`)
    }

    await buildRenderer(renderer)
  }

  await rm(tempRoot, { recursive: true, force: true })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
