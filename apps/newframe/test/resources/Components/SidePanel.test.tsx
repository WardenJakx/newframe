import { Button } from '@newframe/ui/button'
import { Text } from '@newframe/ui/text'
import { describe, expect, it, mock } from 'bun:test'

import { SidePanel } from '../../../resources/Components/SidePanel/SidePanel'
import { fireEvent, render, screen } from '../../componentSetup'

describe('SidePanel', () => {
  it('encapsulates its heading, body, close action, and footer composition', () => {
    const onClose = mock(() => undefined)

    render(
      <SidePanel closeLabel='Close Send' footer={<Button>Proceed</Button>} onClose={onClose} title='Send'>
        <Text>Panel content</Text>
      </SidePanel>
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Send' })).toBeTruthy()
    expect(screen.getByRole('main').textContent).toContain('Panel content')
    expect(screen.getByRole('contentinfo').textContent).toContain('Proceed')
    fireEvent.click(screen.getByRole('button', { name: 'Close Send' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
