import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

import type { Erc7730Display } from '../../main/signatures/erc7730'
import type { Eip712Digests } from '../../main/signatures/digests'
import { DetailRow } from './DetailRow'

type SimpleJsonRow = {
  label: string
  value: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const formatLabel = (path: string) =>
  path
    .replace(/\[(\d+)\]/g, ' $1')
    .replace(/[._]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()

const decodeUtf8Hex = (value: string) => {
  if (!/^0x([0-9a-fA-F]{2})+$/.test(value)) return undefined

  const bytes = value
    .slice(2)
    .match(/.{2}/g)
    ?.map((byte) => parseInt(byte, 16))

  if (!bytes?.length) return undefined

  while (bytes[bytes.length - 1] === 0) bytes.pop()
  if (!bytes.length) return undefined

  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes))
    const printable = decoded.replace(/[\t\n\r]/g, '')
    // eslint-disable-next-line no-control-regex -- reject decoded non-printable control characters.
    if (!printable || /[\x00-\x1F\x7F]/.test(printable)) return undefined

    return `${decoded} (${value})`
  } catch {
    return undefined
  }
}

const formatValue = (value: unknown): string | undefined => {
  if (value === undefined) return undefined
  if (value === null) return 'null'
  if (typeof value === 'string') return decodeUtf8Hex(value) || value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
    return String(value)

  return undefined
}

const flattenJsonRows = (json: unknown, prefix = ''): SimpleJsonRow[] => {
  if (Array.isArray(json)) {
    return json.flatMap((value, index) => flattenJsonRows(value, `${prefix}[${index}]`))
  }

  if (isRecord(json)) {
    return Object.entries(json).flatMap(([key, value]) =>
      flattenJsonRows(value, prefix ? `${prefix}.${key}` : key)
    )
  }

  const value = formatValue(json)
  return value === undefined || !prefix ? [] : [{ label: formatLabel(prefix), value }]
}

const SimpleJSON = ({ rows }: { rows: SimpleJsonRow[] }) => {
  return (
    <Stack gap='none'>
      {rows.map((row, index) => (
        <DetailRow
          code
          key={`${row.label}:${index}`}
          label={row.label}
          labelVariant='overline'
          value={row.value}
          valueVariant='supporting'
        />
      ))}
    </Stack>
  )
}

const SimpleJsonSection = ({ title, rows }: { title?: string; rows: SimpleJsonRow[] }) =>
  rows.length ? (
    <Stack gap='xsmall'>
      {title ? (
        <Text tone='muted' variant='sectionTitle'>
          {title}
        </Text>
      ) : null}
      <SimpleJSON rows={rows} />
    </Stack>
  ) : null

type SimpleTypedDataInnerProps = {
  typedData: unknown
}

type SimpleTypedDataProps = {
  req: {
    type: string
    typedMessage: { data: unknown }
    erc7730?: Erc7730Display
    digests?: Partial<Eip712Digests>
  }
}

const SimpleTypedDataInner = ({ typedData }: SimpleTypedDataInnerProps) => {
  if (isRecord(typedData) && 'domain' in typedData) {
    const domainRows = flattenJsonRows(typedData.domain)
    const messageRows = flattenJsonRows(typedData.message)

    return (
      <Stack gap='medium'>
        <SimpleJsonSection title='Domain' rows={domainRows} />
        <SimpleJsonSection title='Message' rows={messageRows} />
      </Stack>
    )
  }

  const legacyRows = Array.isArray(typedData)
    ? flattenJsonRows(
        typedData.reduce((data: Record<string, unknown>, elem) => {
          if (isRecord(elem) && typeof elem.name === 'string') data[elem.name] = elem.value
          return data
        }, {})
      )
    : flattenJsonRows(typedData)

  return (
    <Stack gap='small'>
      <SimpleJSON rows={legacyRows} />
    </Stack>
  )
}

const DigestRows = ({ digests }: { digests?: Partial<Eip712Digests> }) => {
  const rows = [
    ['EIP-712 Digest', digests?.eip712Digest],
    ['Domain Hash', digests?.domainHash],
    ['Message Hash', digests?.messageHash]
  ].filter((row): row is [string, string] => Boolean(row[1]))

  return rows.length ? (
    <Surface padding='small' radius='small' tone='subtle'>
      <Stack gap='none'>
        {rows.map(([label, value]) => (
          <DetailRow code key={label} label={label} labelVariant='overline' value={value} />
        ))}
      </Stack>
    </Surface>
  ) : null
}

const Erc7730ClearSigning = ({ display }: { display?: Erc7730Display }) => {
  if (!display) return null

  return (
    <Stack gap='xsmall'>
      <Text tone='muted' variant='sectionTitle'>
        ERC-7730 Clear Signing
      </Text>
      <Surface border='accent' padding='small' radius='control'>
        <Stack gap='small'>
          <Text variant='label'>{display.summary || display.title}</Text>
          {display.summary && display.title !== display.summary ? (
            <Text tone='secondary' variant='supporting'>
              {display.title}
            </Text>
          ) : null}
          <Stack gap='none'>
            {display.rows.map((row) => (
              <DetailRow
                code
                key={`${row.path || row.label}:${row.value}`}
                label={row.label}
                value={row.value}
                valueVariant='supporting'
              />
            ))}
          </Stack>
        </Stack>
      </Surface>
    </Stack>
  )
}

export const SimpleTypedData = ({ req }: SimpleTypedDataProps) => {
  const type = req.type
  const typedData = req.typedMessage.data || {}

  return type === 'signTypedData' || type === 'signErc20Permit' ? (
    <Stack gap='medium'>
      <Erc7730ClearSigning display={req.erc7730} />
      <DigestRows digests={req.digests} />
      <Text tone='muted' variant='sectionTitle'>
        Raw Typed Data
      </Text>
      <SimpleTypedDataInner {...{ typedData }} />
    </Stack>
  ) : (
    <Text align='center' tone='danger' variant='label'>
      {'Unknown: ' + req.type}
    </Text>
  )
}
