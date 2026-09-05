import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'

// macOS can emit change events when copyFile reads a source asset. Only rebuild
// when the file's modification time or size actually changes.
export function sourceChanges(directory: string, ignored: ReadonlySet<string>) {
  const versions = new Map<string, string>()
  function version(file: string) {
    try {
      const stat = statSync(file)
      return stat.isFile() ? `${stat.mtimeMs}:${stat.size}` : undefined
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
  }
  function scan(relative = '') {
    for (const entry of readdirSync(path.join(directory, relative), { withFileTypes: true })) {
      if (ignored.has(entry.name) || entry.name.startsWith('.')) continue
      const file = path.join(relative, entry.name)
      if (entry.isDirectory()) scan(file)
      else {
        const current = version(path.join(directory, file))
        if (current !== undefined) versions.set(file, current)
      }
    }
  }
  scan()
  return (file: string) => {
    const current = version(path.join(directory, file))
    if (versions.get(file) === current) return false
    if (current === undefined) versions.delete(file)
    else versions.set(file, current)
    return true
  }
}
