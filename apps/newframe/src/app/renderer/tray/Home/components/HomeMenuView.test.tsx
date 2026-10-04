import { expect, it, mock } from 'bun:test'

import { render, screen } from '../../../../../../test/support/componentSetup.tsx'
import { HomeMenuView } from './HomeMenuView.tsx'

it('keeps requests out of the main menu', () => {
  render(
    <HomeMenuView
      instanceId='tray-test'
      onClose={mock()}
      onOpenAbout={mock()}
      onOpenDapps={mock()}
      onOpenSettings={mock()}
      onOpenTokens={mock()}
      onQuit={mock()}
      tokenCount={0}
    />
  )

  expect(screen.queryByRole('button', { name: 'Requests' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy()
})
