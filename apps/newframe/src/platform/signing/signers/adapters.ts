import { EventEmitter } from 'events'

import type Signer from './Signer/index.js'

export class SignerAdapter extends EventEmitter {
  adapterType: string

  constructor(type: string) {
    super()

    this.adapterType = type
  }

  open() {
    // Optional lifecycle hook for adapters that manage a connection.
  }
  close() {
    // Optional lifecycle hook for adapters that manage a connection.
  }
  remove(_signer: Signer) {
    // Optional hook for adapters that track signer removal.
  }
  reload(_signer: Signer) {
    // Optional hook for adapters that can refresh signer state.
  }
}
