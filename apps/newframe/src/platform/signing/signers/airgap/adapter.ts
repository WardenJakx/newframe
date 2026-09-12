import type canonicalStore from '../../../state-store/index.js'
import { AirGapPublicAccountSchema } from '../../domain/airgap.js'
import { SignerAdapter } from '../adapters.js'
import AirGapSigner from './AirGapSigner.js'
import { airGapId } from './protocol.js'

export default class AirGapAdapter extends SignerAdapter {
  private readonly known = new Map<string, { signer: AirGapSigner; update(): void }>()
  private unsubscribe?: () => void
  private generation = 0
  private opened = false
  constructor(private readonly store: typeof canonicalStore) {
    super('airgap')
  }
  override open() {
    if (this.opened) return
    this.opened = true
    const generation = ++this.generation
    this.unsubscribe = this.store.subscribe(
      (state) => state.main.airgap,
      (records) => {
        for (const [id, entry] of this.known) {
          if (!records[id] || JSON.stringify(records[id]) !== JSON.stringify(entry.signer.record)) {
            this.detach(id)
            this.emit('remove', id)
          }
        }
        for (const [id, raw] of Object.entries(records)) {
          if (this.known.has(id)) continue
          const parsed = AirGapPublicAccountSchema.safeParse(raw)
          if (!parsed.success || airGapId(parsed.data) !== id) continue
          const signer = new AirGapSigner(parsed.data, this.store)
          const update = () => {
            if (this.opened && generation === this.generation && this.known.get(id)?.signer === signer)
              this.emit('update', signer)
          }
          this.known.set(id, { signer, update })
          signer.on('update', update)
          this.emit('add', signer)
        }
      },
      { fireImmediately: true }
    )
  }
  private detach(id: string) {
    const entry = this.known.get(id)
    if (!entry) return
    this.known.delete(id)
    entry.signer.removeListener('update', entry.update)
    entry.signer.close()
  }
  override close() {
    if (!this.opened) return
    this.opened = false
    ++this.generation
    this.unsubscribe?.()
    this.unsubscribe = undefined
    for (const id of this.known.keys()) this.detach(id)
  }
  override remove(signer: AirGapSigner) {
    this.detach(signer.id)
    this.store.getState().removeAirGap(signer.id)
  }
  override reload(signer: AirGapSigner) {
    const record = this.store.getState().main.airgap[signer.id]
    this.detach(signer.id)
    this.emit('remove', signer.id)
    if (record) this.store.getState().addAirGap(signer.id, record)
  }
}
