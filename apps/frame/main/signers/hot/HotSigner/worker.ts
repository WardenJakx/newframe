import crypto from 'crypto'
import { signTypedData, personalSign, recoverPersonalSignature } from '@metamask/eth-sig-util'
import { createTx } from '@ethereumjs/tx'
import { bytesToHex } from '@ethereumjs/util'
import { Common, createCustomCommon, Holesky, Mainnet, Sepolia } from '@ethereumjs/common'

export type PseudoCallback = (error: unknown, result?: any) => void

export interface WorkerRPCMessage {
  id: string
  method: string
  params: any
  token: string
}

// keep this in sync with main/chains/config — duplicated here because the worker
// is forked as a plain node process and can't require the TypeScript module from source
const knownChains: Record<number, any> = { 1: Mainnet, 17000: Holesky, 11155111: Sepolia }

function chainConfig(chain: number, hardfork: string) {
  return chain in knownChains
    ? new Common({ chain: knownChains[chain], hardfork })
    : createCustomCommon({ chainId: chain }, Mainnet, { hardfork })
}

class HotSignerWorker {
  token: string

  constructor() {
    this.token = crypto.randomBytes(32).toString('hex')
    process.send!({ type: 'token', token: this.token })
  }

  handleMessage({ id, method, params, token }: WorkerRPCMessage) {
    // Define (pseudo) callback
    const pseudoCallback: PseudoCallback = (error, result) => {
      // Add correlation id to response
      const response = { id, error, result, type: 'rpc' }
      // Send response to parent process
      process.send!(response)
    }
    // Verify token
    if (!crypto.timingSafeEqual(Buffer.from(token), Buffer.from(this.token)))
      return pseudoCallback('Invalid token')
    // If method exists -> execute
    if ((this as any)[method]) return (this as any)[method](params, pseudoCallback)
    // Else return error
    pseudoCallback(`Invalid method: '${method}'`)
  }

  signMessage(key: any, message: any, pseudoCallback: PseudoCallback) {
    pseudoCallback(null, personalSign({ privateKey: key, data: message }))
  }

  signTypedData(key: any, typedMessage: any, pseudoCallback: PseudoCallback) {
    try {
      const { data, version } = typedMessage
      const signature = signTypedData({ privateKey: key, data, version })
      pseudoCallback(null, signature)
    } catch (e) {
      pseudoCallback((e as Error).message)
    }
  }

  signTransaction(key: any, rawTx: any, pseudoCallback: PseudoCallback) {
    if (!rawTx.chainId) {
      console.error(`invalid chain id ${rawTx.chainId} for transaction`)
      return pseudoCallback('could not determine chain id for transaction')
    }

    const chainId = parseInt(rawTx.chainId, 16)
    const hardfork = parseInt(rawTx.type) === 2 ? 'london' : 'berlin'
    const common = chainConfig(chainId, hardfork)

    const tx = createTx(rawTx, { common })
    const signedTx = tx.sign(key)

    pseudoCallback(null, bytesToHex(signedTx.serialize()))
  }

  verifyAddress({ index, address }: { index: number; address: string }, pseudoCallback: PseudoCallback) {
    const message = '0x' + crypto.randomBytes(32).toString('hex')
    // subclasses override signMessage with a ({ index, message }, pseudoCallback) signature
    ;(this.signMessage as any)({ index, message }, (err: unknown, signedMessage: string) => {
      // Handle signing errors
      if (err) return pseudoCallback(err)
      // Ensure correct length
      if (Buffer.from(signedMessage.replace('0x', ''), 'hex').length !== 65)
        return pseudoCallback(new Error('Frame verifyAddress signature has incorrect length'))
      // Verify address
      const verifiedAddress = recoverPersonalSignature({ data: message, signature: signedMessage })
      // Return result
      pseudoCallback(null, verifiedAddress.toLowerCase() === address.toLowerCase())
    })
  }

  _encrypt(string: string, password: string) {
    const salt = crypto.randomBytes(16)
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-cbc', this._hashPassword(password, salt)!, iv)
    const encrypted = Buffer.concat([cipher.update(string), cipher.final()])
    return salt.toString('hex') + ':' + iv.toString('hex') + ':' + encrypted.toString('hex')
  }

  _decrypt(string: string, password: string) {
    const parts = string.split(':')
    const salt = Buffer.from(parts.shift()!, 'hex')
    const iv = Buffer.from(parts.shift()!, 'hex')
    const decipher = crypto.createDecipheriv('aes-256-cbc', this._hashPassword(password, salt)!, iv)
    const encryptedString = Buffer.from(parts.join(':'), 'hex')
    const decrypted = Buffer.concat([decipher.update(encryptedString), decipher.final()])
    return decrypted.toString()
  }

  _hashPassword(password: string, salt: Buffer): Buffer | undefined {
    try {
      return crypto.scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 36000000 })
    } catch (e) {
      console.error('Error during hashPassword', e) // TODO: Handle Error
    }
  }
}

export default HotSignerWorker
