import { useState } from 'react'
import { Button } from '@newframe/ui/button'
import { Dialog } from '@newframe/ui/dialog'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

import { capitalize } from '../../../shared/domain/text'
import { AppIcon } from '../../../shared/renderer/ui/appIcon'
import type { ConnectionsCapability } from './connectionsCapability'

export type ExtensionConnectNotificationProps = {
  browser: string
  capability: Pick<ConnectionsCapability, 'copyText' | 'respondToExtension'>
  id: string
}

export default function ExtensionConnectNotification({
  id,
  browser,
  capability
}: ExtensionConnectNotificationProps) {
  const respond = (accepted: boolean) => {
    void capability.respondToExtension({
      extensionId: id,
      approved: accepted
    })
  }
  const browserName = capitalize(browser)
  const [copyId, setCopyId] = useState(false)

  const copyExtensionId = () => {
    void capability.copyText({ text: id })
    setCopyId(true)
    setTimeout(() => setCopyId(false), 2000)
  }

  return (
    <Dialog label='Extension connection request' padding='large' width='compact'>
      <Stack align='center' gap='large'>
        <Text decorative tone='accent'>
          <AppIcon name='firefox' size={40} />
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
