import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const temporaryRoots: string[] = []
const version = '2026.1002.1'
const team = 'TESTTEAM01'

function verifyRelease(failure = '') {
  const root = mkdtempSync(path.join(tmpdir(), 'newframe-signing-test-'))
  temporaryRoots.push(root)
  const bin = path.join(root, 'bin')
  const mounts = path.join(root, 'mounts')
  mkdirSync(bin)
  mkdirSync(mounts)
  const dmg = path.join(root, 'Newframe-arm64.dmg')
  writeFileSync(dmg, '')
  const tor = path.join(root, 'tor')
  mkdirSync(path.join(tor, 'tor/lib/nested'), { recursive: true })
  mkdirSync(path.join(tor, 'data'))
  // Real Mach-O headers exercise file detection, including extensionless and
  // non-executable files. GeoIP data must not be treated as signed code.
  const header = Buffer.alloc(32)
  header.writeUInt32LE(0xfeedfacf, 0)
  header.writeUInt32LE(0x0100000c, 4)
  header.writeUInt32LE(2, 12)
  writeFileSync(path.join(tor, 'tor/tor'), header)
  header.writeUInt32LE(6, 12)
  writeFileSync(path.join(tor, 'tor/lib/nested/libevent.dylib'), header)
  writeFileSync(path.join(tor, 'data/geoip'), 'Tor GeoIP data\n')

  const commands: Record<string, string> = {
    find: `
if [[ "$STUB_FAILURE" == tor-find ]]; then
  printf '%s\\0' "$1/tor/tor"
  exit 1
fi
exec /usr/bin/find "$@"
`,
    codesign: `
artifact="\${@: -1}"
scope=dmg
[[ "$artifact" == *.app ]] && scope=app
[[ "$artifact" == */Resources/tor/tor/tor ]] && scope=tor
[[ "$artifact" == *.dylib ]] && scope=dylib
if [[ "$1" == --verify ]]; then
  [[ "$STUB_FAILURE" != "$scope-verify" ]]
  exit
fi
echo 'Identifier=sh.newframe.app' >&2
if [[ "$STUB_FAILURE" == "$scope-adhoc" ]]; then
  echo 'Signature=adhoc' >&2
else
  echo 'Authority=Developer ID Application: Test Developer (TESTTEAM01)' >&2
fi
if [[ "$STUB_FAILURE" != "$scope-timestamp" ]]; then
  echo 'Timestamp=Oct 2, 2026 at 12:00:00 PM' >&2
fi
if [[ "$STUB_FAILURE" == "$scope-team" ]]; then
  echo 'TeamIdentifier=OTHERTEAM1' >&2
elif [[ "$STUB_FAILURE" != "$scope-no-team" ]]; then
  echo 'TeamIdentifier=TESTTEAM01' >&2
fi
if [[ "$STUB_FAILURE" == "$scope-runtime" ]]; then
  echo 'flags=0x0(none)' >&2
else
  echo 'flags=0x10000(runtime)' >&2
fi
`,
    xcrun: `
scope=dmg
[[ "\${@: -1}" == *.app ]] && scope=app
[[ "$STUB_FAILURE" != "$scope-ticket" ]]
`,
    spctl: `
scope=dmg
[[ "\${@: -1}" == *.app ]] && scope=app
[[ "$STUB_FAILURE" != "$scope-gatekeeper" ]]
`,
    hdiutil: `
if [[ "$1" == attach ]]; then
  while [[ "$1" != -mountpoint ]]; do shift; done
  mount_dir="$2"
  printf '%s' "$mount_dir" > "$STUB_ROOT/mount-path"
  mkdir -p "$mount_dir/Newframe.app/Contents/MacOS" "$mount_dir/Newframe.app/Contents/Resources"
  touch "$mount_dir/Newframe.app/Contents/Info.plist" "$mount_dir/Newframe.app/Contents/MacOS/Newframe"
  cp -R "$STUB_ROOT/tor" "$mount_dir/Newframe.app/Contents/Resources/tor"
else
  rm -r "$2/Newframe.app"
fi
`,
    plutil: `
test -f "\${@: -1}"
echo '2026.1002.1'
`,
    lipo: `
test -f "\${@: -1}"
echo arm64
`
  }

  for (const [command, script] of Object.entries(commands)) {
    writeFileSync(
      path.join(bin, command),
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s' '${command}' >> "$STUB_ROOT/calls"
printf ' %s' "$@" >> "$STUB_ROOT/calls"
printf '\\n' >> "$STUB_ROOT/calls"
${script}`,
      { mode: 0o755 }
    )
  }

  const result = Bun.spawnSync(
    ['bash', path.join(import.meta.dir, 'verify-macos-release.sh'), dmg, version, team],
    {
      env: {
        PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`,
        TMPDIR: mounts,
        STUB_ROOT: root,
        STUB_FAILURE: failure
      }
    }
  )
  const calls = readFileSync(path.join(root, 'calls'), 'utf8').trim().split('\n')
  const mounted = existsSync(path.join(root, 'mount-path'))
  const mount = mounted ? readFileSync(path.join(root, 'mount-path'), 'utf8') : undefined
  return { result, calls, dmg, mounts, mount }
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('macOS release verification', () => {
  test('checks the signed DMG and its mounted app, then detaches', () => {
    const { result, calls, dmg, mounts, mount } = verifyRelease()
    expect(result.exitCode, result.stderr.toString()).toBe(0)
    expect(mount).toBeDefined()
    const app = `${mount}/Newframe.app`
    for (const check of [
      `codesign --verify --deep --strict --verbose=2 ${dmg}`,
      `codesign --verify --deep --strict --verbose=2 ${app}`,
      `codesign --verify --deep --strict --verbose=2 ${app}/Contents/Resources/tor/tor/tor`,
      `codesign --verify --deep --strict --verbose=2 ${app}/Contents/Resources/tor/tor/lib/nested/libevent.dylib`,
      `xcrun stapler validate ${dmg}`,
      `xcrun stapler validate ${app}`,
      `spctl --assess --type open --context context:primary-signature --verbose=2 ${dmg}`,
      `spctl --assess --type execute --verbose=2 ${app}`
    ]) {
      expect(calls).toContain(check)
    }
    expect(calls.some((call) => call.startsWith('codesign ') && call.includes('/data/geoip'))).toBe(false)
    expect(calls.at(-1)).toBe(`hdiutil detach ${mount}`)
    expect(readdirSync(mounts)).toEqual([])
  })

  test.each(['dmg-team', 'dmg-verify', 'dmg-timestamp', 'dmg-ticket', 'dmg-gatekeeper'])(
    'rejects %s before mounting',
    (failure) => {
      const { result, calls, mounts, mount } = verifyRelease(failure)
      expect(result.exitCode).not.toBe(0)
      expect(mount).toBeUndefined()
      expect(calls.some((call) => call.startsWith('hdiutil'))).toBe(false)
      expect(readdirSync(mounts)).toEqual([])
    }
  )

  test.each(['app-team', 'app-adhoc', 'app-runtime', 'app-ticket', 'app-gatekeeper'])(
    'rejects %s and detaches the mounted image',
    (failure) => {
      const { result, calls, mounts, mount } = verifyRelease(failure)
      expect(result.exitCode).not.toBe(0)
      expect(mount).toBeDefined()
      expect(calls.at(-1)).toBe(`hdiutil detach ${mount}`)
      expect(readdirSync(mounts)).toEqual([])
    }
  )

  test.each([
    'tor-find',
    ...['tor', 'dylib'].flatMap((scope) =>
      ['adhoc', 'team', 'no-team', 'runtime', 'timestamp', 'verify'].map((failure) => `${scope}-${failure}`)
    )
  ])('rejects nested %s even when the app signature passes', (failure) => {
    const { result, calls, mounts, mount } = verifyRelease(failure)
    expect(result.exitCode).not.toBe(0)
    expect(mount).toBeDefined()
    expect(calls).toContain(`codesign --verify --deep --strict --verbose=2 ${mount}/Newframe.app`)
    expect(calls).not.toContain(`spctl --assess --type execute --verbose=2 ${mount}/Newframe.app`)
    expect(calls.at(-1)).toBe(`hdiutil detach ${mount}`)
    expect(readdirSync(mounts)).toEqual([])
  })
})
