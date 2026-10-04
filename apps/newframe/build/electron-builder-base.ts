import type { Configuration } from 'electron-builder'

import { prepareTorBundle } from './tor-bundle.ts'

const config = {
  appId: 'sh.newframe.app',
  productName: 'Newframe',
  beforePack: prepareTorBundle,
  extraResources: [{ from: 'build/tor/${os}-${arch}', to: 'tor' }],
  files: ['compiled', 'bundle', '!compiled/src/platform/runtime/dev']
} satisfies Configuration

export default config
