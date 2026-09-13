import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import { ParsedMessage } from '@spruceid/siwe-parser'
import { useMemo, type ReactNode } from 'react'

import { cva } from '../../../../../../generated/styled-system/css/cva.js'
import { RequestOrigin } from '../../ui/RequestOrigin'
import type { SignRequestView } from './requestViewTypes'

const messageRecipe = cva({
  base: { margin: 0, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }
})
const valueRecipe = cva({ base: { minWidth: 0, overflowWrap: 'anywhere' } })
const summaryRecipe = cva({ base: { cursor: 'pointer', paddingBlock: '3', color: 'text.secondary' } })
const detailsRecipe = cva({ base: { margin: 0, display: 'grid', gap: '4' } })
const detailValueRecipe = cva({ base: { margin: 0, overflowWrap: 'anywhere' } })

function Message({ text }: { text: string }) {
  return (
    <Surface border='subtle' padding='medium' radius='control' tone='raised'>
      <pre aria-label='Message to sign' className={messageRecipe()}>
        <Text variant='code'>{text}</Text>
      </pre>
    </Surface>
  )
}

function parseSignInMessage(message: string) {
  try {
    return new ParsedMessage(message)
  } catch {
    return undefined
  }
}

// Stored requester names may omit the transport scheme. Compare authority only;
// this does not establish a verified origin or infer the request's scheme.
function authority(value: string) {
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`)
    return url.username || url.password || url.pathname !== '/' || url.search || url.hash
      ? undefined
      : url.host
  } catch {
    return undefined
  }
}

type MessageToSignProps = {
  req: SignRequestView
  originName?: string
  favicon?: string
  signingAccount?: ReactNode
  signingAddress?: string
}

export default function MessageToSign({
  req,
  originName,
  favicon = '',
  signingAccount,
  signingAddress = req.account
}: MessageToSignProps) {
  const message = req.data.decodedMessage
  const signIn = useMemo(() => parseSignInMessage(message), [message])
  const requester = originName || req.origin
  const requesterAuthority = authority(requester)
  const domainMismatch = signIn && (!requesterAuthority || requesterAuthority !== authority(signIn.domain))
  const addressMismatch = signIn && signingAddress.toLowerCase() !== signIn.address.toLowerCase()

  if (!signIn) {
    return (
      <Surface padding='large' tone='transparent'>
        <Stack gap='medium'>
          {signingAccount}
          {message.includes('wants you to sign in with your Ethereum account') ? (
            <Text tone='danger' variant='supporting'>
              This message resembles a sign-in request but has an invalid format. Review the full message.
            </Text>
          ) : null}
          <Message text={message} />
        </Stack>
      </Surface>
    )
  }

  const metadata = [
    ['Version', signIn.version],
    ['Chain ID', String(signIn.chainId)],
    ['Nonce', signIn.nonce],
    ['Issued at', signIn.issuedAt],
    ['Expiration time', signIn.expirationTime],
    ['Not before', signIn.notBefore],
    ['Request ID', signIn.requestId]
  ]

  return (
    <Surface padding='large' tone='transparent'>
      <Stack gap='large'>
        <RequestOrigin originName={requester} favicon={favicon} description='wants you to sign in' />
        <Stack gap='small'>
          <Text tone='secondary' variant='overline'>
            Signing account
          </Text>
          {signingAccount}
          <div className={valueRecipe()}>
            <Text variant='code'>{signIn.address}</Text>
          </div>
          {addressMismatch ? (
            <Text tone='danger' variant='supporting'>
              The address in this message differs from the signing account: {signingAddress}
            </Text>
          ) : null}
        </Stack>
        <Surface border='subtle' padding='medium' radius='control' tone='raised'>
          <Stack gap='medium'>
            <Stack gap='xsmall'>
              <Text tone='secondary' variant='overline'>
                Sign-in domain
              </Text>
              <div className={valueRecipe()}>
                <Text variant='label'>
                  {signIn.scheme ? `${signIn.scheme}://` : ''}
                  {signIn.domain}
                </Text>
              </div>
            </Stack>
            <Stack gap='xsmall'>
              <Text tone='secondary' variant='overline'>
                Sign-in URL
              </Text>
              <div className={valueRecipe()}>
                <Text variant='code'>{signIn.uri}</Text>
              </div>
            </Stack>
            {domainMismatch ? (
              <Text tone='danger' variant='supporting'>
                The sign-in domain does not match the requesting site. Check both before signing.
              </Text>
            ) : null}
            {signIn.statement ? <Text variant='body'>{signIn.statement}</Text> : null}
            {signIn.resources?.length ? (
              <Stack gap='small'>
                <Text tone='secondary' variant='overline'>
                  Resources
                </Text>
                {signIn.resources.map((resource, index) => (
                  <div className={valueRecipe()} key={`${index}:${resource}`}>
                    <Text variant='code'>{resource}</Text>
                  </div>
                ))}
              </Stack>
            ) : null}
          </Stack>
        </Surface>
        <details>
          <summary className={summaryRecipe()}>Sign-in details</summary>
          <dl className={detailsRecipe()}>
            {metadata.map(([label, value]) =>
              value !== undefined ? (
                <div key={label}>
                  <dt>
                    <Text tone='secondary' variant='supporting'>
                      {label}
                    </Text>
                  </dt>
                  <dd className={detailValueRecipe()}>
                    <Text variant='code'>{value}</Text>
                  </dd>
                </div>
              ) : null
            )}
          </dl>
        </details>
        <details>
          <summary className={summaryRecipe()}>Raw message</summary>
          <Message text={message} />
        </details>
      </Stack>
    </Surface>
  )
}
