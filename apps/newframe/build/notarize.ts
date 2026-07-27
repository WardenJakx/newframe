import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { notarize } from '@electron/notarize'
import type { AfterPackContext } from 'electron-builder'

function requiredEnvironmentVariable(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required notarization environment variable: ${name}`)
  return value
}

export default async function notarizeApp(params: AfterPackContext) {
  if (process.platform !== 'darwin') return // Only notarize the app on macOS
  const appId = 'sh.newframe.app' // Same appId in electron-builder
  const appPath = path.join(params.appOutDir, `${params.packager.appInfo.productFilename}.app`)
  if (!existsSync(appPath)) throw new Error(`Cannot find application at: ${appPath}`)

  console.log(`Notarizing ${appId} found at ${appPath}`)

  try {
    await notarize({
      appPath,
      appleId: requiredEnvironmentVariable('APPLE_ID'),
      appleIdPassword: requiredEnvironmentVariable('APPLE_APP_SPECIFIC_PASSWORD'),
      teamId: requiredEnvironmentVariable('APPLE_TEAM_ID')
    })

    // verify signed and notarized application
    execFileSync(
      'spctl',
      ['--assess', '--type', 'execute', '--verbose', '--ignore-cache', '--no-cache', appPath],
      {}
    )

    console.log(`Successfully notarized ${appId}`)
  } catch (error) {
    console.error(error)
    throw error
  }
}
