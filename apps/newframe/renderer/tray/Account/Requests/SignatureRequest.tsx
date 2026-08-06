import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

import type { SignatureRequest } from '../../../../contracts/requests'
import { cva } from '../../../../generated/styled-system/css/cva.js'

const messageRecipe = cva({
  base: {
    margin: 0,
    overflowWrap: 'anywhere',
    whiteSpace: 'pre-wrap'
  }
})

const Message = ({ text }: { text: string }) => {
  return (
    <Surface border='subtle' padding='medium' radius='control' tone='raised'>
      <pre aria-label='Message to sign' className={messageRecipe()}>
        <Text variant='code'>{text}</Text>
      </pre>
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
