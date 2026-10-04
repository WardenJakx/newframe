import type { ChildProcess } from 'node:child_process'

import { ProcessService } from '../core/process-service.ts'
import type { HarnessService } from '../core/service.ts'
import { withTimeout } from '../core/utils.ts'

// Matches the app's fixed visual-harness work area.
const screen = '1440x900x24'

function readDisplayNumber(child: ChildProcess) {
  return new Promise<string>((resolve) => {
    let output = ''
    child.stdout!.on('data', (chunk: Buffer) => {
      output += chunk.toString()
      const line = output.match(/^(\d+)\n/)
      if (line) {
        resolve(line[1])
      }
    })
  })
}

/**
 * A private X server for the visual harness on Linux. Linux cannot make native windows transparent or
 * click-through, so harness windows live on their own display instead of the developer's desktop.
 */
export class XvfbService implements HarnessService<string> {
  readonly name = 'Xvfb'
  private display?: string
  private readonly process = new ProcessService({
    name: this.name,
    command: 'Xvfb',
    // Xvfb picks a free display number and writes it to stdout.
    args: ['-displayfd', '1', '-screen', '0', screen, '-nolisten', 'tcp'],
    spawn: { stdio: ['ignore', 'pipe', 'pipe'] },
    ready: async (child) => {
      this.display = `:${await withTimeout(readDisplayNumber(child), 'Xvfb display', 10_000)}`
    }
  })

  get failure() {
    return this.process.failure
  }

  async start() {
    await this.process.start()
    return this.display!
  }

  stop() {
    return this.process.stop()
  }
}
