import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import { useMemo } from 'react'

import { cva } from '../../../../../../generated/styled-system/css/cva.js'
import { inspectSiweMessage } from '../../../domain'
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

type MessageToSignProps = {
  req: SignRequestView
  originName?: string
  favicon?: string
  signingAddress?: string
}

export default function MessageToSign({
  req,
  originName,
  favicon = '',
  signingAddress = req.account
}: MessageToSignProps) {
  const message = req.data.decodedMessage
  const requestOrigin = req.requestOrigin
  const isContractAccount = req.signingCapability?.type === 'safe'
  const inspection = useMemo(
    () => inspectSiweMessage(message, requestOrigin, { signingAddress, isContractAccount }),
    [message, requestOrigin, signingAddress, isContractAccount]
  )
  const signIn = inspection.kind === 'siwe' ? inspection.parsed : undefined
  const requester = originName ?? req.origin
  const addressMismatch = signIn && signingAddress.toLowerCase() !== signIn.address.toLowerCase()

  if (!signIn) {
    return (
      <Surface padding='large' tone='transparent'>
        <Stack gap='medium'>
          <RequestOrigin originName={requester} favicon={favicon} description='wants you to sign a message' />
          {inspection.kind === 'invalid' ? (
            <Text tone='danger' variant='supporting'>
              {inspection.warning}
            </Text>
          ) : null}
          <Message text={message} />
        </Stack>
      </Surface>
    )
  }

  const metadata = [
    ['Version', signIn.version],
    ['Chain ID', message.match(/^Chain ID: (\d+)$/m)?.[1]],
    ['Nonce', signIn.nonce],
    ['Issued at', signIn.issuedAt],
    ['Expiration time', signIn.expirationTime],
    ['Not before', signIn.notBefore],
    ['Request ID', signIn.requestId]
  ]
  const resources = signIn.resources?.map((value, position) => ({
    path: `${position}:${value}`,
    value
  }))

  return (
    <Surface padding='large' tone='transparent'>
      <Stack gap='large'>
        <RequestOrigin originName={requester} favicon={favicon} description='wants you to sign in' />
        <Stack gap='small'>
          <Text tone='secondary' variant='overline'>
            Address in message
          </Text>
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
                Request origin
              </Text>
              <div aria-label='Request origin' className={valueRecipe()}>
                <Text variant='code'>{requestOrigin ?? 'Unavailable'}</Text>
              </div>
            </Stack>
            <Stack gap='xsmall'>
              <Text tone='secondary' variant='overline'>
                Sign-in domain
              </Text>
              <div className={valueRecipe()}>
                <Text variant='label'>
                  {`${signIn.scheme ?? 'https'}://`}
                  {signIn.domain}
                </Text>
              </div>
              {!signIn.scheme ? (
                <Text tone='secondary' variant='supporting'>
                  HTTPS assumed because no scheme was provided.
                </Text>
              ) : null}
            </Stack>
            <Stack gap='xsmall'>
              <Text tone='secondary' variant='overline'>
                Sign-in URL
              </Text>
              <div className={valueRecipe()}>
                <Text variant='code'>{signIn.uri}</Text>
              </div>
            </Stack>
            {inspection.kind === 'siwe' && inspection.blockedReason ? (
              <div role='alert'>
                <Text tone='danger' variant='supporting'>
                  {inspection.blockedReason}
                </Text>
              </div>
            ) : null}
            {inspection.kind === 'siwe'
              ? inspection.warnings.map((warning) => (
                  <Text key={warning} tone='accent' variant='supporting'>
                    {warning}
                  </Text>
                ))
              : null}
            {signIn.statement ? <Text variant='body'>{signIn.statement}</Text> : null}
            {resources?.length ? (
              <Stack gap='small'>
                <Text tone='secondary' variant='overline'>
                  Resources
                </Text>
                {resources.map((resource) => (
                  <div className={valueRecipe()} key={resource.path}>
                    <Text variant='code'>{resource.value}</Text>
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
