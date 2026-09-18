import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'

import { ETHSignature, EthSignRequest } from '@keystonehq/bc-ur-registry-eth'
import { URDecoder, UREncoder } from '@ngraveio/bc-ur'

import type {
  CanonicalAccountRequest,
  TypedMessage
} from '../../../src/features/requests/contract/requests.js'
import { RequestStatus } from '../../../src/features/requests/contract/requests.js'
import { GasFeesSource } from '../../../src/features/transactions/domain/index.js'
import type { TransactionData } from '../../../src/features/transactions/domain/index.js'
import AirGapSigner from '../../../src/platform/signing/signers/airgap/AirGapSigner.js'
import {
  AirGapUrAssembler,
  decodePublicAccount
} from '../../../src/platform/signing/signers/airgap/protocol.js'
import type { SignerRequestContext } from '../../../src/platform/signing/signers/Signer/index.js'
import createCanonicalStore from '../../../src/platform/state-store/createCanonicalStore.js'
import vectors from './airgap-vectors.json'

export { vectors }
export function publicAccount() {
  const decoder = new AirGapUrAssembler('crypto-hdkey')
  let cbor: Buffer | undefined
  for (const frame of vectors.export.ur) {
    cbor = decoder.receive(frame) ?? cbor
  }
  return decodePublicAccount(cbor!)
}
export function uiContext(requestId = randomUUID()) {
  const lifecycle = new EventEmitter()
  const controller = new AbortController()
  let active = true
  const context: SignerRequestContext = {
    requestId,
    accountId: vectors.export.address.toLowerCase(),
    chainId: 1,
    signal: controller.signal,
    owner: { clientType: 'wallet-ui', windowInstanceId: randomUUID() },
    isOwnerActive: () => active,
    subscribeOwnerDisposed(dispose) {
      if (!active) {
        dispose()
        return () => {}
      }
      lifecycle.once('disposed', dispose)
      return () => {
        lifecycle.removeListener('disposed', dispose)
      }
    }
  }
  return {
    context,
    listenerCount: () => lifecycle.listenerCount('disposed'),
    abort: () => controller.abort(),
    destroy() {
      active = false
      lifecycle.emit('disposed')
    }
  }
}
export function transaction(vector = vectors.transactions[0]): TransactionData {
  return {
    from: vectors.export.address.toLowerCase(),
    type: `0x${vector.type}`,
    chainId: `0x${vector.chainId.toString(16)}`,
    nonce: '0x1',
    gasFeesSource: GasFeesSource.Frame,
    gasLimit: '0xc350',
    to: '0x' + '11'.repeat(20),
    value: '0x1',
    data: '0x1234',
    ...(vector.type === 0
      ? { gasPrice: '0xb2d05e00' }
      : { maxPriorityFeePerGas: '0x3b9aca00', maxFeePerGas: '0xb2d05e00', accessList: [] })
  }
}
export function signerFixture(record = publicAccount()) {
  const store = createCanonicalStore({
    getItem: () => null,
    setItem() {
      return undefined
    },
    removeItem() {
      return undefined
    }
  }).store
  const signer = new AirGapSigner(record)
  store.getState().newSigner(signer.summary())
  signer.on('update', () => store.getState().updateSigner(signer.summary()))
  const address = signer.addresses[0].toLowerCase()
  store.getState().upsertAccount({
    id: address,
    name: 'AirGap fixture',
    created: '0:1',
    address,
    signer: signer.id,
    lastSignerType: 'airgap',
    status: 'ok',
    requests: {}
  })
  store.setState((state) => {
    state.main.currentAccount = address
  })
  const owner = uiContext()
  owner.context.accountId = address
  const request = (
    type: 'sign' | 'transaction' | 'signTypedData',
    data?: TransactionData | TypedMessage | string
  ) => {
    let method = 'eth_signTypedData_v4'
    if (type === 'transaction') {
      method = 'eth_sendTransaction'
    } else if (type === 'sign') {
      method = 'personal_sign'
    }
    let requestData = {}
    if (type === 'transaction') {
      requestData = { data }
    } else if (type === 'signTypedData') {
      requestData = { typedMessage: data as TypedMessage }
    }
    const record: CanonicalAccountRequest & { data?: unknown; typedMessage?: TypedMessage } = {
      handlerId: owner.context.requestId,
      type,
      origin: 'airgap-test',
      account: address,
      status: RequestStatus.Pending,
      payload: {
        id: 'test',
        jsonrpc: '2.0',
        method,
        params: type === 'transaction' ? [data] : [address, data]
      },
      authorization: {
        actionId: owner.context.requestId,
        decision: 'prompt',
        decidedAt: 1,
        principal: { kind: 'main', component: 'airgap-test' },
        intent: { account: address, method: 'test', requestType: type }
      },
      ...requestData
    }
    store.getState().upsertAccountRequest(address, record)
    return record
  }
  const reference = () => ({ signerId: signer.id, ...signer.summary().airgapRequest! })
  const frames = (signature: string, id = reference().sessionId) =>
    new UREncoder(
      new ETHSignature(Buffer.from(signature, 'hex'), Buffer.from(id.replaceAll('-', ''), 'hex')).toUR(),
      250
    ).encodeWhole()
  const envelope = () => {
    const decoder = new URDecoder()
    signer.getRequest(reference(), owner.context.owner)!.forEach((frame) => decoder.receivePart(frame))
    return EthSignRequest.fromCBOR(decoder.resultUR().cbor)
  }
  return {
    store,
    signer,
    address,
    owner,
    request,
    reference,
    frames,
    envelope,
    dispose: () => signer.close()
  }
}
