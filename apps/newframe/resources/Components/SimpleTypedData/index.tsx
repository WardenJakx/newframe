import type { Erc7730Display } from '../../../main/signatures/erc7730'

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
    <div className='simpleJson'>
      {rows.map((row, index) => (
        <div key={`${row.label}:${index}`} className='simpleJsonChild'>
          <div className='simpleJsonKey simpleJsonKeyTx'>{row.label}</div>
          <div className='simpleJsonValue'>{row.value}</div>
        </div>
      ))}
    </div>
  )
}

const SimpleJsonSection = ({ title, rows }: { title?: string; rows: SimpleJsonRow[] }) =>
  rows.length ? (
    <>
      {title ? <div className='simpleJsonHeader'>{title}</div> : null}
      <SimpleJSON rows={rows} />
    </>
  ) : null

const SimpleTypedDataInner = ({ typedData }: { typedData: any }) => {
  if (typedData.domain) {
    const domainRows = flattenJsonRows(typedData.domain)
    const messageRows = flattenJsonRows(typedData.message)

    return (
      <div className='signTypedDataInner'>
        <SimpleJsonSection title='Domain' rows={domainRows} />
        <SimpleJsonSection title='Message' rows={messageRows} />
      </div>
    )
  }

  const legacyRows = Array.isArray(typedData)
    ? flattenJsonRows(
        typedData.reduce((data: Record<string, unknown>, elem: { name: string; value: unknown }) => {
          data[elem.name] = elem.value
          return data
        }, {})
      )
    : flattenJsonRows(typedData)

  return (
    <div className='signTypedDataSection'>
      <SimpleJSON rows={legacyRows} />
    </div>
  )
}

const DigestRows = ({ digests }: { digests?: Record<string, string> }) => {
  const rows = [
    ['EIP-712 Digest', digests?.eip712Digest],
    ['Domain Hash', digests?.domainHash],
    ['Message Hash', digests?.messageHash]
  ].filter((row): row is [string, string] => Boolean(row[1]))

  return rows.length ? (
    <div className='signatureDigestRows'>
      {rows.map(([label, value]) => (
        <div key={label} className='signatureDigestRow'>
          <div className='signatureDigestLabel'>{label}</div>
          <div className='signatureDigestValue'>{value}</div>
        </div>
      ))}
    </div>
  ) : null
}

const Erc7730ClearSigning = ({ display }: { display?: Erc7730Display }) => {
  if (!display) return null

  return (
    <div className='erc7730ClearSigning'>
      <div className='txViewDataHeader'>ERC-7730 Clear Signing</div>
      <div className='erc7730Card'>
        <div className='erc7730Title'>{display.summary || display.title}</div>
        {display.summary && display.title !== display.summary ? (
          <div className='erc7730Intent'>{display.title}</div>
        ) : null}
        <div className='erc7730Rows'>
          {display.rows.map((row) => (
            <div key={`${row.path || row.label}:${row.value}`} className='erc7730Row'>
              <div className='erc7730Label'>{row.label}</div>
              <div className='erc7730Value'>{row.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export const SimpleTypedData = ({ req }: { req: any }) => {
  const type = req.type
  const typedData = req.typedMessage.data || {}

  return type === 'signTypedData' || type === 'signErc20Permit' ? (
    <div className='accountViewScroll typedDataScroll cardShow'>
      <div className='txViewData'>
        <Erc7730ClearSigning display={req.erc7730} />
        <DigestRows digests={req.digests} />
        <div className='txViewDataHeader'>{'Raw Typed Data'}</div>
        <SimpleTypedDataInner {...{ typedData }} />
        <div className='typedDataActionSpacer' />
      </div>
    </div>
  ) : (
    <div className='unknownType'>{'Unknown: ' + req.type}</div>
  )
}
