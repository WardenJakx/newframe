import { SignTypedDataVersion } from '@metamask/eth-sig-util'
import { formatUnits, getAddress, isAddress, keccak256, toUtf8Bytes } from 'ethers'

import type { TypedData, TypedMessage } from '../accounts/types'

const REGISTRY_BASE_URL = 'https://raw.githubusercontent.com/ethereum/clear-signing-erc7730-registry/master'
const EIP712_INDEX_URL = `${REGISTRY_BASE_URL}/index.eip712.json`
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 4000
const MAX_INCLUDE_DEPTH = 5

type JsonPrimitive = string | number | boolean | null
type Erc7730TypedDataTypes = Record<string, Array<{ name: string; type: string }>>

type VisibleRule =
  | 'always'
  | 'never'
  | 'optional'
  | {
      ifNotIn?: JsonPrimitive[]
      mustMatch?: JsonPrimitive[]
      mustBe?: JsonPrimitive[]
    }

interface Field {
  path?: string
  value?: JsonPrimitive
  visible?: VisibleRule
  label?: string
  format?: string
  params?: Record<string, unknown>
  fields?: Field[]
  $ref?: string
}

interface DisplayFormat {
  intent?: string
  interpolatedIntent?: string
  fields?: Field[]
}

export interface Erc7730Descriptor {
  includes?: string | string[]
  context?: {
    eip712?: {
      domain?: Record<string, unknown>
      deployments?: Array<{ chainId?: number; address?: string }>
    }
  }
  metadata?: {
    token?: {
      name?: string
      ticker?: string
      symbol?: string
      decimals?: number
    }
    enums?: Record<string, Record<string, string> | { values?: Record<string, string> }>
  } & Record<string, unknown>
  display?: {
    definitions?: Record<string, Field>
    formats?: Record<string, DisplayFormat>
  }
}

interface Erc7730DisplayRow {
  label: string
  value: string
  path?: string
  format?: string
}

export interface Erc7730Display {
  title: string
  summary?: string
  descriptorPath?: string
  rows: Erc7730DisplayRow[]
}

type Eip712IndexEntry = {
  path: string
  encodeTypeHashes?: string[]
}

type Eip712Index = Record<string, Record<string, Eip712IndexEntry[]>>
type FetchLike = typeof fetch
type CacheEntry<T> = { value: T; fetchedAt: number }
type DescriptorResult = { descriptor: Erc7730Descriptor; path?: string }
type FormatMatch = { formatKey: string; format: DisplayFormat; values: Record<string, unknown> }
type FormatContext = {
  descriptor: Erc7730Descriptor
  root: Record<string, unknown>
}

let indexCache: CacheEntry<Eip712Index> | undefined
const descriptorCache = new Map<string, CacheEntry<Erc7730Descriptor>>()

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toBigIntOrNull(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number' || typeof value === 'string') {
    try {
      return BigInt(value)
    } catch {
      return null
    }
  }

  return null
}

function valueToText(value: unknown): string {
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null) return 'null'
  if (Array.isArray(value)) return value.map(valueToText).join(', ')

  return JSON.stringify(value, (_key, nestedValue) =>
    typeof nestedValue === 'bigint' ? nestedValue.toString() : nestedValue
  )
}

function getBaseType(type: string) {
  const bracketIndex = type.indexOf('[')
  return bracketIndex === -1 ? type : type.slice(0, bracketIndex)
}

function encodeTypeFragment(typeName: string, types: Erc7730TypedDataTypes): string {
  const fields = types[typeName]
  if (!fields) throw new Error(`Missing EIP-712 type ${typeName}`)

  return `${typeName}(${fields.map(({ name, type }) => `${type} ${name}`).join(',')})`
}

export function getEip712EncodeType(types: Erc7730TypedDataTypes, primaryType: string): string {
  if (!types[primaryType]) throw new Error(`Missing primary EIP-712 type ${primaryType}`)

  const customTypeNames = new Set(Object.keys(types).filter((typeName) => typeName !== 'EIP712Domain'))
  const dependencies = new Set<string>()

  const collectDependencies = (typeName: string) => {
    types[typeName]?.forEach(({ type }) => {
      const baseType = getBaseType(type)
      if (!customTypeNames.has(baseType) || dependencies.has(baseType)) return

      dependencies.add(baseType)
      collectDependencies(baseType)
    })
  }

  collectDependencies(primaryType)
  dependencies.delete(primaryType)

  return [primaryType, ...Array.from(dependencies).sort()]
    .map((typeName) => encodeTypeFragment(typeName, types))
    .join('')
}

export function getEip712EncodeTypeHash(types: Erc7730TypedDataTypes, primaryType: string): string {
  return keccak256(toUtf8Bytes(getEip712EncodeType(types, primaryType))).toLowerCase()
}

function getPathSegments(path: string) {
  return path.replace(/^\./, '').split('.').filter(Boolean)
}

function readPath(source: unknown, path: string): unknown {
  if (!path) return source

  return getPathSegments(path).reduce<unknown>((currentValue, segment) => {
    if (currentValue === undefined || currentValue === null) return undefined

    if (segment.startsWith('[') && segment.endsWith(']')) {
      const index = Number(segment.slice(1, -1))
      if (!Array.isArray(currentValue) || !Number.isInteger(index)) return undefined
      return currentValue[index < 0 ? currentValue.length + index : index]
    }

    if (Array.isArray(currentValue)) {
      const index = Number(segment)
      if (Number.isInteger(index)) return currentValue[index]
      return currentValue.map((item) => (isPlainObject(item) ? item[segment] : undefined))
    }

    return isPlainObject(currentValue) ? currentValue[segment] : undefined
  }, source)
}

function resolvePath(path: string | undefined, context: FormatContext, base: unknown): unknown {
  if (!path) return undefined
  if (path === '#') return context.root
  if (path.startsWith('#.')) return readPath(context.root, path.slice(2))
  if (path === '@') return context.root['@']
  if (path.startsWith('@.')) return readPath(context.root['@'], path.slice(2))
  if (path === '$') return context.descriptor
  if (path.startsWith('$.')) return readPath(context.descriptor, path.slice(2))

  const valueFromBase = readPath(base, path)
  return valueFromBase === undefined ? readPath(context.root, path) : valueFromBase
}

function normalizePath(path?: string) {
  return (path || '').replace(/^#\./, '').replace(/^\./, '')
}

function normalizeComparableValue(value: unknown) {
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'string') return value.toLowerCase()
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  return valueToText(value)
}

function matchesPrimitive(left: unknown, right: unknown) {
  return normalizeComparableValue(left) === normalizeComparableValue(right)
}

function getVisibility(rule: VisibleRule | undefined, value: unknown) {
  if (!rule || rule === 'always' || rule === 'optional') return { visible: true, valid: true }
  if (rule === 'never') return { visible: false, valid: true }

  const required = rule.mustMatch || rule.mustBe
  if (required) {
    return { visible: false, valid: required.some((expected) => matchesPrimitive(value, expected)) }
  }

  if (rule.ifNotIn) {
    return { visible: !rule.ifNotIn.some((hidden) => matchesPrimitive(value, hidden)), valid: true }
  }

  return { visible: true, valid: true }
}

function resolveFieldReference(field: Field, context: FormatContext): Field {
  if (!field.$ref) return field

  const referencedField = resolvePath(field.$ref, context, context.root)
  if (!isPlainObject(referencedField)) return field

  return {
    ...(referencedField as Field),
    ...field,
    $ref: undefined
  }
}

function getTokenMetadata(context: FormatContext) {
  const token = context.descriptor.metadata?.token
  if (!token) return undefined

  return {
    decimals: typeof token.decimals === 'number' ? token.decimals : undefined,
    symbol: token.ticker || token.symbol || token.name
  }
}

function getEnumValue(value: unknown, field: Field, context: FormatContext) {
  const enumRef = field.params?.$ref
  if (typeof enumRef !== 'string') return undefined

  const enumDefinition = resolvePath(enumRef, context, context.root)
  if (!isPlainObject(enumDefinition)) return undefined

  const values = isPlainObject(enumDefinition.values) ? enumDefinition.values : enumDefinition
  const enumValue = values[valueToText(value)]
  return typeof enumValue === 'string' ? enumValue : undefined
}

function formatDate(value: unknown, field: Field) {
  if (field.params?.encoding === 'blockheight') return `Block ${valueToText(value)}`

  const timestamp = toBigIntOrNull(value)
  if (timestamp === null) return valueToText(value)

  const date = new Date(Number(timestamp) * 1000)
  return Number.isNaN(date.getTime()) ? valueToText(value) : date.toISOString()
}

function formatDuration(value: unknown) {
  const duration = toBigIntOrNull(value)
  if (duration === null) return valueToText(value)

  const hours = duration / 3600n
  const minutes = (duration % 3600n) / 60n
  const seconds = duration % 60n

  return [hours, minutes, seconds].map((part) => part.toString().padStart(2, '0')).join(':')
}

function formatUnit(value: unknown, field: Field) {
  const amount = toBigIntOrNull(value)
  const base = typeof field.params?.base === 'string' ? field.params.base : ''
  const decimals = typeof field.params?.decimals === 'number' ? field.params.decimals : 0
  if (amount === null) return `${valueToText(value)}${base ? ` ${base}` : ''}`

  return `${formatUnits(amount, decimals)}${base ? ` ${base}` : ''}`
}

function formatFieldValue(field: Field, value: unknown, context: FormatContext) {
  if (field.format === 'addressName' || field.format === 'interoperableAddressName') {
    return typeof value === 'string' && isAddress(value) ? getAddress(value) : valueToText(value)
  }

  if (field.format === 'tokenAmount') {
    const amount = toBigIntOrNull(value)
    const threshold = toBigIntOrNull(field.params?.threshold)
    const metadata = getTokenMetadata(context)

    if (threshold !== null && amount !== null && amount >= threshold) {
      return `${field.params?.message || 'Unlimited'}${metadata?.symbol ? ` ${metadata.symbol}` : ''}`
    }

    if (amount !== null && metadata?.decimals !== undefined) {
      return `${formatUnits(amount, metadata.decimals)}${metadata.symbol ? ` ${metadata.symbol}` : ''}`
    }
  }

  if (field.format === 'amount') {
    const amount = toBigIntOrNull(value)
    if (amount !== null) return `${formatUnits(amount, 18)} ETH`
  }

  if (field.format === 'date') return formatDate(value, field)
  if (field.format === 'duration') return formatDuration(value)
  if (field.format === 'unit') return formatUnit(value, field)
  if (field.format === 'enum') return getEnumValue(value, field, context) || valueToText(value)
  if (typeof value === 'string' && isAddress(value)) return getAddress(value)

  return valueToText(value)
}

function fieldToRows(
  field: Field,
  context: FormatContext,
  base: unknown,
  formattedByPath: Map<string, string>
): Erc7730DisplayRow[] | null {
  const resolvedField = resolveFieldReference(field, context)
  const value =
    resolvedField.value !== undefined ? resolvedField.value : resolvePath(resolvedField.path, context, base)
  const visibility = getVisibility(resolvedField.visible, value)

  if (!visibility.valid) return null
  if (!visibility.visible) return []

  if (resolvedField.fields?.length) {
    const groupedValue = value ?? base
    const groupedValues = Array.isArray(groupedValue) ? groupedValue : [groupedValue]
    return groupedValues.reduce<Erc7730DisplayRow[] | null>((rows, item) => {
      if (!rows) return null
      const nestedRows = fieldsToRows(resolvedField.fields || [], context, item, formattedByPath)
      if (!nestedRows) return null

      rows.push(...nestedRows)
      return rows
    }, [])
  }

  if (value === undefined) return resolvedField.visible === 'optional' ? [] : null

  const formattedValue = formatFieldValue(resolvedField, value, context)
  if (resolvedField.path) formattedByPath.set(normalizePath(resolvedField.path), formattedValue)

  return [
    {
      label: resolvedField.label || resolvedField.path || '',
      value: formattedValue,
      path: resolvedField.path,
      format: resolvedField.format
    }
  ]
}

function fieldsToRows(
  fields: Field[],
  context: FormatContext,
  base: unknown,
  formattedByPath: Map<string, string>
) {
  return fields.reduce<Erc7730DisplayRow[] | null>((rows, field) => {
    if (!rows) return null

    const nextRows = fieldToRows(field, context, base, formattedByPath)
    if (!nextRows) return null

    rows.push(...nextRows)
    return rows
  }, [])
}

function interpolateIntent(template: string, formattedByPath: Map<string, string>) {
  let interpolated = ''
  let currentIndex = 0

  while (currentIndex < template.length) {
    const openingBraceIndex = template.indexOf('{', currentIndex)
    if (openingBraceIndex === -1) return interpolated + template.slice(currentIndex)

    const closingBraceIndex = template.indexOf('}', openingBraceIndex + 1)
    if (closingBraceIndex === -1) return undefined

    interpolated += template.slice(currentIndex, openingBraceIndex)

    const path = normalizePath(template.slice(openingBraceIndex + 1, closingBraceIndex).trim())
    const value = formattedByPath.get(path)
    if (value === undefined) return undefined

    interpolated += value
    currentIndex = closingBraceIndex + 1
  }

  return interpolated
}

function getTypedMessageFormatMatch(
  typedData: TypedData,
  descriptor: Erc7730Descriptor
): FormatMatch | undefined {
  const formats = descriptor.display?.formats || {}
  const primaryType = String(typedData.primaryType)
  let encodeType: string | undefined
  let encodeTypeHash: string | undefined

  try {
    encodeType = getEip712EncodeType(typedData.types as Erc7730TypedDataTypes, primaryType)
    encodeTypeHash = keccak256(toUtf8Bytes(encodeType)).toLowerCase()
  } catch {
    encodeType = undefined
  }

  const entry = Object.entries(formats).find(([formatKey]) => {
    if (encodeType && formatKey === encodeType) return true
    if (!formatKey.startsWith(`${primaryType}(`)) return false
    if (!encodeTypeHash) return true

    return keccak256(toUtf8Bytes(formatKey)).toLowerCase() === encodeTypeHash
  })

  return entry
    ? {
        formatKey: entry[0],
        format: entry[1],
        values: typedData.message as Record<string, unknown>
      }
    : undefined
}

function isDomainMatch(domain: Record<string, unknown>, constraints: Record<string, unknown>) {
  return Object.entries(constraints).every(([key, expected]) => {
    const actual = domain[key]
    if (key === 'verifyingContract' && typeof actual === 'string' && typeof expected === 'string') {
      return actual.toLowerCase() === expected.toLowerCase()
    }

    return matchesPrimitive(actual, expected)
  })
}

function isDescriptorBoundToTypedData(descriptor: Erc7730Descriptor, typedData: TypedData) {
  const eip712 = descriptor.context?.eip712
  if (!eip712) return true

  const domain = isPlainObject(typedData.domain) ? typedData.domain : {}
  if (eip712.domain && !isDomainMatch(domain, eip712.domain)) return false

  if (eip712.deployments?.length) {
    return eip712.deployments.some(({ chainId, address }) => {
      if (chainId !== undefined && !matchesPrimitive(domain.chainId, chainId)) return false
      if (address !== undefined) {
        return (
          typeof domain.verifyingContract === 'string' &&
          domain.verifyingContract.toLowerCase() === address.toLowerCase()
        )
      }

      return true
    })
  }

  return true
}

export function formatErc7730TypedData(
  typedMessage: TypedMessage,
  descriptor: Erc7730Descriptor,
  descriptorPath?: string
): Erc7730Display | undefined {
  if (typedMessage.version === SignTypedDataVersion.V1 || Array.isArray(typedMessage.data)) return undefined

  const typedData = typedMessage.data as TypedData
  if (!isDescriptorBoundToTypedData(descriptor, typedData)) return undefined

  const match = getTypedMessageFormatMatch(typedData, descriptor)
  if (!match) return undefined

  const context: FormatContext = {
    descriptor,
    root: {
      ...match.values,
      '@': {
        domain: typedData.domain,
        chainId: (typedData.domain as Record<string, unknown>)?.chainId,
        verifyingContract: (typedData.domain as Record<string, unknown>)?.verifyingContract
      }
    }
  }
  const formattedByPath = new Map<string, string>()
  const rows = fieldsToRows(match.format.fields || [], context, match.values, formattedByPath)
  if (!rows) return undefined

  const intent = typeof match.format.intent === 'string' ? match.format.intent : match.formatKey
  const summary = match.format.interpolatedIntent
    ? interpolateIntent(match.format.interpolatedIntent, formattedByPath)
    : undefined

  return {
    title: intent,
    ...(summary ? { summary } : {}),
    ...(descriptorPath ? { descriptorPath } : {}),
    rows
  }
}

async function fetchJson<T>(url: string, fetcher: FetchLike) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetcher(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`Failed to fetch ERC-7730 resource: ${url}`)
    return (await response.json()) as T
  } finally {
    clearTimeout(timeout)
  }
}

async function getEip712Index(fetcher: FetchLike) {
  if (indexCache && Date.now() - indexCache.fetchedAt < CACHE_TTL_MS) return indexCache.value

  const index = await fetchJson<Eip712Index>(EIP712_INDEX_URL, fetcher)
  indexCache = { value: index, fetchedAt: Date.now() }
  return index
}

function getDescriptorUrl(path: string, parentPath?: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  if (parentPath && !path.startsWith('/')) return new URL(path, getDescriptorUrl(parentPath)).toString()

  return `${REGISTRY_BASE_URL}/${path.replace(/^\//, '')}`
}

function mergeDescriptors(base: Erc7730Descriptor, override: Erc7730Descriptor): Erc7730Descriptor {
  const merge = (left: unknown, right: unknown): unknown => {
    if (isPlainObject(left) && isPlainObject(right)) {
      return Object.keys(right).reduce<Record<string, unknown>>(
        (acc, key) => ({
          ...acc,
          [key]: merge(acc[key], right[key])
        }),
        { ...left }
      )
    }

    return right === undefined ? left : right
  }

  return merge(base, override) as Erc7730Descriptor
}

async function fetchDescriptor(
  path: string,
  fetcher: FetchLike,
  parentPath?: string,
  depth = 0
): Promise<DescriptorResult> {
  const url = getDescriptorUrl(path, parentPath)
  const cached = descriptorCache.get(url)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return { descriptor: cached.value, path }

  const descriptor = await fetchJson<Erc7730Descriptor>(url, fetcher)
  const includes = descriptor.includes
    ? Array.isArray(descriptor.includes)
      ? descriptor.includes
      : [descriptor.includes]
    : []

  const included =
    includes.length && depth < MAX_INCLUDE_DEPTH
      ? await Promise.all(
          includes.map((includePath) => fetchDescriptor(includePath, fetcher, path, depth + 1))
        )
      : []
  const mergedIncludes = included.reduce<Erc7730Descriptor>(
    (merged, include) => mergeDescriptors(merged, include.descriptor),
    {}
  )
  const mergedDescriptor = mergeDescriptors(mergedIncludes, descriptor)

  descriptorCache.set(url, { value: mergedDescriptor, fetchedAt: Date.now() })
  return { descriptor: mergedDescriptor, path }
}

function getRegistryKey(chainId: unknown, verifyingContract: string) {
  return `eip155:${BigInt(valueToText(chainId)).toString()}:${verifyingContract.toLowerCase()}`
}

function getTypedDataRegistryLookup(typedMessage: TypedMessage) {
  if (typedMessage.version === SignTypedDataVersion.V1 || Array.isArray(typedMessage.data)) return undefined

  const typedData = typedMessage.data as TypedData
  const domain = typedData.domain as Record<string, unknown>
  const verifyingContract = domain?.verifyingContract
  const chainId = domain?.chainId

  if (typeof verifyingContract !== 'string' || !isAddress(verifyingContract) || chainId === undefined) {
    return undefined
  }

  return {
    typedData,
    key: getRegistryKey(chainId, verifyingContract),
    primaryType: String(typedData.primaryType),
    encodeTypeHash: getEip712EncodeTypeHash(
      typedData.types as Erc7730TypedDataTypes,
      String(typedData.primaryType)
    )
  }
}

function selectIndexEntry(entries: Eip712IndexEntry[], encodeTypeHash: string) {
  return (
    entries.find(
      (entry) =>
        !entry.encodeTypeHashes?.length ||
        entry.encodeTypeHashes.some((hash) => hash.toLowerCase() === encodeTypeHash)
    ) || entries[0]
  )
}

export async function getErc7730TypedDataDisplay(
  typedMessage: TypedMessage,
  fetcher: FetchLike = fetch
): Promise<Erc7730Display | undefined> {
  try {
    const lookup = getTypedDataRegistryLookup(typedMessage)
    if (!lookup) return undefined

    const index = await getEip712Index(fetcher)
    const entries = index[lookup.key]?.[lookup.primaryType]
    if (!entries?.length) return undefined

    const entry = selectIndexEntry(entries, lookup.encodeTypeHash)
    if (!entry) return undefined

    const { descriptor, path } = await fetchDescriptor(entry.path, fetcher)
    return formatErc7730TypedData(typedMessage, descriptor, path)
  } catch {
    return undefined
  }
}

export function clearErc7730Caches() {
  indexCache = undefined
  descriptorCache.clear()
}
