import type { Configuration } from 'electron-builder'

const config = {
  appId: 'sh.newframe.app',
  productName: 'Newframe',
  files: ['compiled', 'bundle', '!compiled/main/dev']
} satisfies Configuration

export default config
