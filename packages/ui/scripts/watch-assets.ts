import { watch } from 'node:fs'
import path from 'node:path'

import { copyAssets } from './copy-assets.ts'
import { generateTokens } from './generate-tokens.ts'

const sourceRoot = path.resolve(import.meta.dirname, '../src')
let timer: ReturnType<typeof setTimeout> | undefined

async function rebuild() {
  await generateTokens()
  await copyAssets()
  console.log('Updated @newframe/ui tokens and assets')
}

watch(sourceRoot, { recursive: true }, () => {
  clearTimeout(timer)
  timer = setTimeout(() => void rebuild(), 50)
})

console.log('Watching @newframe/ui tokens and assets')
