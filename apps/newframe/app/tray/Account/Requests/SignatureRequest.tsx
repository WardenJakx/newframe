import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

import type { SignatureRequest } from '../../../../main/accounts/types'

const Message = ({ text }: { text: string }) => {
  return (
    <Surface border='subtle' padding='medium' radius='control' tone='raised'>
      <Text variant='code'>{text}</Text>
    </Surface>
  )
}

type MessageToSignProps = {
  req: Extract<SignatureRequest, { type: 'sign' }> & { id?: string }
}

const MessageToSign = ({ req }: MessageToSignProps) => {
  const { id, handlerId, type } = req

  const message = req.data.decodedMessage
  return type === 'sign' ? (
    <Message key={id || handlerId} text={message} />
  ) : (
    <Text align='center' tone='danger' variant='label'>
      {'Unknown: ' + type}
    </Text>
  )
}

export default MessageToSign
