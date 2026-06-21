const SimpleJSON = ({ json }: { json: any }) => {
  return (
    <div className='simpleJson'>
      {Object.keys(json).map((key, o) => {
        const value = json[key]
        return (
          <div key={key + o} className='simpleJsonChild'>
            <div className='simpleJsonKey simpleJsonKeyTx'>{key.replace(/([A-Z])/g, ' $1').trim()}</div>
            <div className='simpleJsonValue'>
              {!!value && typeof value === 'object' ? <SimpleJSON json={value} key={key} /> : value}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const SimpleTypedDataInner = ({ typedData }: { typedData: any }) =>
  typedData.domain ? (
    <div className='signTypedDataInner'>
      <div className='simpleJsonHeader'>Domain</div>
      <SimpleJSON json={typedData.domain} />
      <div className='simpleJsonHeader'>Message</div>
      <SimpleJSON json={typedData.message} />
    </div>
  ) : (
    <div className='signTypedDataSection'>
      <SimpleJSON
        json={typedData.reduce((data: Record<string, any>, elem: { name: string; value: any }) => {
          data[elem.name] = elem.value
          return data
        }, {})}
      />
    </div>
  )

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

export const SimpleTypedData = ({ req }: { req: any }) => {
  const type = req.type
  const typedData = req.typedMessage.data || {}

  return type === 'signTypedData' || type === 'signErc20Permit' ? (
    <div className='accountViewScroll cardShow'>
      <div className='txViewData'>
        <DigestRows digests={req.digests} />
        <div className='txViewDataHeader'>{'Raw Typed Data'}</div>
        <SimpleTypedDataInner {...{ typedData }} />
      </div>
    </div>
  ) : (
    <div className='unknownType'>{'Unknown: ' + req.type}</div>
  )
}
