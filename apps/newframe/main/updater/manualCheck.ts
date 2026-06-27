import log from 'electron-log'
import semver from 'semver'

import type { VersionUpdate } from '.'

import packageInfo from '../../package.json'

type PackageRepository = string | { url?: string }

function getGithubRepo(repository: PackageRepository) {
  const repositoryUrl = typeof repository === 'string' ? repository : repository.url || ''
  const cleanedUrl = repositoryUrl.replace(/^git\+/, '').replace(/\.git$/, '')

  if (cleanedUrl.startsWith('github:')) return cleanedUrl.slice('github:'.length)

  const match = cleanedUrl.match(/github\.com[:/]([^/]+)\/([^/#?]+)/)
  if (!match) throw new Error(`Unsupported repository URL: ${repositoryUrl}`)

  return `${match[1]}/${match[2]}`
}

const repo = getGithubRepo(packageInfo.repository)
const version = packageInfo.version
const releasesUrl = `https://api.github.com/repos/${repo}/releases`
const requestOptions = {
  headers: { 'User-Agent': 'request' }
}

interface GithubRelease {
  prerelease: boolean
  tag_name: string
  html_url: string
}

interface CheckOptions {
  prereleaseTrack?: boolean
}

function parseResponse(rawData: string) {
  try {
    return JSON.parse(rawData) as GithubRelease[]
  } catch (e) {
    log.warn('Manual check for update returned invalid JSON response', e)
    return []
  }
}

function compareVersions(a: string, b: string) {
  if (semver.gt(a, b)) return 1
  if (semver.lt(a, b)) return -1
  return 0
}

export default async function (opts?: CheckOptions): Promise<VersionUpdate | undefined> {
  log.verbose('Performing manual check for updates', { prereleaseTrack: opts?.prereleaseTrack })

  const res = await fetch(releasesUrl, requestOptions)
  const rawData = await res.text()
  const contentType = res.headers.get('content-type') || ''

  log.debug('Manual check response', { status: res.status, contentType })
  if (res.status != 200 || !contentType.includes('json')) {
    log.warn('Manual check for update returned invalid response', {
      status: res.status,
      contentType,
      data: rawData
    })
    throw new Error(`invalid response, status: ${res.status} contentType: ${contentType}`)
  }

  const releases = parseResponse(rawData).filter((r) => !r.prerelease || opts?.prereleaseTrack) || []
  const latestRelease = releases[0] || { tag_name: '' }

  if (latestRelease.tag_name) {
    const latestVersion =
      latestRelease.tag_name.charAt(0) === 'v' ? latestRelease.tag_name.substring(1) : latestRelease.tag_name
    const isNewerVersion = compareVersions(latestVersion, version) === 1

    log.verbose('Manual check found release', {
      currentVersion: version,
      latestVersion,
      isNewerVersion
    })

    return isNewerVersion ? { version: latestRelease.tag_name, location: latestRelease.html_url } : undefined
  } else {
    log.verbose('Manual check did not find any releases')
    throw new Error('no releases found')
  }
}
