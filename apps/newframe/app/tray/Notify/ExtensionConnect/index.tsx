import { useState } from 'react'
import { Button } from '@newframe/ui/button'
import { Dialog } from '@newframe/ui/dialog'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

import link from '../../../../resources/link'
import { capitalize } from '../../../../resources/utils'
import svg from '../../../../resources/svg'

export type ExtensionConnectNotificationProps = {
  browser: string
  id: string
  onClose: () => void
}

export default function ExtensionConnectNotification({
  id,
  browser,
  onClose
}: ExtensionConnectNotificationProps) {
  const respond = async (accepted: boolean) => {
    const result = await link.executeCommand({
      type: 'extension.respond',
      extensionId: id,
      approved: accepted
    })
    if (result.ok) onClose()
  }
  const browserName = capitalize(browser)
  const [copyId, setCopyId] = useState(false)

  const copyExtensionId = () => {
    void link.executeCommand({ type: 'clipboard.write', text: id })
    setCopyId(true)
    setTimeout(() => setCopyId(false), 2000)
  }

  return (
    <Dialog label='Extension connection request' padding='large' width='compact'>
      <Stack align='center' gap='large'>
        <Text decorative tone='accent'>
          {svg.firefox(40)}
        </Text>
        <Text align='center'>
          {`A new ${browserName} extension is attempting to connect as “Newframe Companion”.`}
        </Text>
        <Text align='center' tone='secondary' variant='supporting'>
          If you did not recently add Newframe Companion, verify the extension origin below.
        </Text>
        <Button appearance='control' onPress={copyExtensionId} shape='control' width='full'>
          <Surface padding='small' radius='small' tone='raised'>
            <Text align='center' variant='code'>
              {copyId ? 'Extension origin copied' : id}
            </Text>
          </Surface>
        </Button>
        <Text align='center' variant='overline'>
          Allow this extension to connect?
        </Text>
        <Stack direction='row' equal gap='small'>
          <Button appearance='danger' onPress={() => void respond(false)} shape='pill'>
            <Text variant='action'>Decline</Text>
          </Button>
          <Button appearance='primary' onPress={() => void respond(true)} shape='pill'>
            <Text variant='action'>Accept</Text>
          </Button>
        </Stack>
      </Stack>
    </Dialog>
  )
}
