import { watch, type FSWatcher } from 'node:fs'
import path from 'node:path'

import { sourceChanges } from '../../../scripts/source-changes.ts'

import { appDir, rootDir } from '../core/config.ts'
import { ProcessService, expectSuccessfulExit } from '../core/process-service.ts'
import type { HarnessService } from '../core/service.ts'

import { createElectronProcessService } from './electron.ts'

// Build outputs must never trigger another build.
const ignoredDirectories = new Set([
  'node_modules',
  'compiled',
  'bundle',
  'dist',
  'dist-preview',
  'dist-release',
  'generated',
  'styled-system',
  'coverage',
  'build',
  '.cache'
])

export class DevelopmentAppService implements HarnessService<{ exited: Promise<number> }> {
  readonly name = 'Newframe development app'
  private readonly completion = Promise.withResolvers<number>()
  private readonly watchers: FSWatcher[] = []
  private current?: ProcessService
  private timer?: ReturnType<typeof setTimeout>
  private rebuilding = false
  private pending = false
  private stopping = false

  constructor(private readonly onLaunch: () => void) {}

  async start() {
    this.completion.promise.catch(() => undefined)
    for (const directory of [appDir, path.join(rootDir, 'packages/ui'), path.join(rootDir, 'assets')]) {
      const changed = sourceChanges(directory, ignoredDirectories)
      const watcher = watch(directory, { recursive: true }, (_event, filename) => {
        if (!filename) return
        const parts = filename.split(path.sep)
        if (parts.some((part) => ignoredDirectories.has(part) || part.startsWith('.'))) return
        if (filename.endsWith('.tsbuildinfo')) return
        if (!changed(filename)) return
        this.pending = true
        if (this.timer) clearTimeout(this.timer)
        this.timer = setTimeout(() => {
          void this.rebuild().catch((error: unknown) => this.completion.reject(error))
        }, 250)
      })
      watcher.on('error', (error) => this.completion.reject(error))
      this.watchers.push(watcher)
    }
    this.pending = true
    await this.rebuild()
    return { exited: this.completion.promise }
  }

  private async rebuild() {
    if (this.rebuilding || this.stopping) return
    this.rebuilding = true
    try {
      while (this.pending && !this.stopping) {
        this.pending = false
        const previous = this.current
        this.current = undefined
        await previous?.stop()
        if (this.stopping) return

        console.log('[dev] Building shared UI and app…')
        try {
          for (const script of ['compile', 'bundle:app']) {
            if (this.stopping) return
            const build = new ProcessService({
              name: script,
              command: 'bun',
              args: ['run', script],
              spawn: { cwd: appDir, stdio: 'inherit' }
            })
            this.current = build
            await expectSuccessfulExit(await build.start(), script)
          }
        } catch (error) {
          if (this.stopping) return
          console.error('[dev] Build failed. Fix the source and save to retry.', error)
          continue
        }
        if (this.stopping || this.pending) continue

        const electron = createElectronProcessService()
        this.current = electron
        const handle = await electron.start()
        if (this.stopping) {
          await electron.stop()
          return
        }
        handle.exited.then(
          (code) => {
            if (this.current === electron && !this.stopping) this.completion.resolve(code)
          },
          (error: unknown) => {
            if (this.current === electron && !this.stopping) this.completion.reject(error)
          }
        )
        this.onLaunch()
        console.log('[dev] Watching app, shared UI, and assets. Save to rebuild and restart.')
      }
    } finally {
      this.rebuilding = false
    }
  }

  async stop() {
    this.stopping = true
    if (this.timer) clearTimeout(this.timer)
    this.watchers.forEach((watcher) => watcher.close())
    await this.current?.stop()
    this.completion.resolve(0)
  }
}
