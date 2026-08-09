import type { Configuration } from 'electron-builder'

const config = {
  appId: 'sh.newframe.app',
  productName: 'Newframe',
  files: ['compiled', 'bundle', '!compiled/src/platform/runtime/dev']
} satisfies Configuration

export default config
