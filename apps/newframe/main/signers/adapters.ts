import { EventEmitter } from 'events'
import Signer from './Signer'

export class SignerAdapter extends EventEmitter {
  adapterType: string

  constructor(type: string) {
    super()

    this.adapterType = type
  }

  open() {}
  close() {}
  remove(signer: Signer) {}
  reload(signer: Signer) {}
}
