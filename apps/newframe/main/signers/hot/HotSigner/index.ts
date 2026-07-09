import path from 'path'
import fs from 'fs'
import { fork, ChildProcess } from 'child_process'
import { app } from 'electron'
import log from 'electron-log'
import { v4 as uuid } from 'uuid'

import Signer from '../../Signer'
import store from '../../../store'

type WorkerCallback = (err: Error | null, result?: any) => void

// Mock user data dir during tests
const USER_DATA = app
  ? app.getPath('userData')
  : path.resolve(path.dirname(require.main!.filename), '../.userData')
const SIGNERS_PATH = path.resolve(USER_DATA, 'signers')

class HotSigner extends Signer {
  network?: string
  encryptedKeys?: string
  encryptedSeed?: string
  ready: boolean
  _worker: ChildProcess
  _token?: string
  _closed = false

  constructor(signer: any, workerPath: string) {
    super()
    this.status = 'locked'
    this.addresses = (signer && signer.addresses) || []
    this._worker = fork(workerPath)
    this._worker.on('error', (err) => {
      if (!this._closed) log.error('Hot signer worker error', err)
    })
    this._getToken()
    this.ready = false
  }

  save(data?: any) {
    // Construct signer
    const { id, addresses, type, network } = this
    const signer = { id, addresses, type, network, ...data }

    // Ensure signers directory exists
    fs.mkdirSync(SIGNERS_PATH, { recursive: true })

    // Write signer to disk
    fs.writeFileSync(path.resolve(SIGNERS_PATH, `${id}.json`), JSON.stringify(signer), { mode: 0o600 })

    // Log
    log.debug('Signer saved to disk')
  }

  override delete() {
    const signerPath = path.resolve(SIGNERS_PATH, `${this.id}.json`)

    // Overwrite file
    fs.writeFileSync(signerPath, '00000000000000000000000000000000000000000000000000000000000000000000', {
      mode: 0o600
    })

    // Remove file
    fs.rmSync(signerPath, { force: true })

    // Log
    log.info('Signer erased from disk')
  }

  lock(cb: WorkerCallback) {
    this._callWorker({ method: 'lock' }, () => {
      this.status = 'locked'
      this.update()
      log.info('Signer locked')
      cb(null)
    })
  }

  unlock(password: string, data: any, cb: WorkerCallback) {
    const params = { password, ...data }
    this._callWorker({ method: 'unlock', params }, (err, result) => {
      if (err) return cb(err)
      this.status = 'ok'
      this.update()
      log.info('Signer unlocked')
      cb(null)
    })
  }

  override close() {
    this._closed = true
    try {
      if (!this._worker.killed) this._worker.kill()
    } catch (e) {
      // Worker may already be closed by the time close is called.
    }
    store.removeSigner(this.id)
    log.info('Signer closed')
  }

  override update() {
    // Get derived ID
    const derivedId = this.fingerprint()!

    // On new ID ->
    if (!this.id) {
      // Update id
      this.id = derivedId
      // Write to disk
      this.save({ encryptedKeys: this.encryptedKeys, encryptedSeed: this.encryptedSeed })
    } else if (this.id !== derivedId) {
      // On changed ID
      // Erase from disk
      this.delete()
      // Remove from store
      store.removeSigner(this.id)
      // Update id
      this.id = derivedId
      // Write to disk
      this.save({ encryptedKeys: this.encryptedKeys, encryptedSeed: this.encryptedSeed })
    }

    store.updateSigner(this.summary())
    log.info('Signer updated')
  }

  override signMessage(index: number, message: string, cb: Callback<string>) {
    const payload = { method: 'signMessage', params: { index, message } }
    this._callWorker(payload, cb as WorkerCallback)
  }

  override signTypedData(index: number, typedMessage: any, cb: Callback<string>) {
    const payload = { method: 'signTypedData', params: { index, typedMessage } }
    this._callWorker(payload, cb as WorkerCallback)
  }

  override signTransaction(index: number, rawTx: any, cb: Callback<string>) {
    const payload = { method: 'signTransaction', params: { index, rawTx } }
    this._callWorker(payload, cb as WorkerCallback)
  }

  exportPrivateKey(index: number, cb: Callback<string>) {
    const payload = { method: 'exportPrivateKey', params: { index } }
    this._callWorker(payload, cb as WorkerCallback)
  }

  override verifyAddress(index: number, address: string, display: boolean, cb: Callback<boolean> = () => {}) {
    const payload = { method: 'verifyAddress', params: { index, address } }
    this._callWorker(payload, (err: Error | null, verified?: any) => {
      if (err || !verified) {
        if (!err) {
          err = new Error('Unable to verify address')
        }
        this.emit('lockApp')
        this.lock(() => {
          if (err) {
            log.error('HotSigner verifyAddress: Unable to verify address')
          } else {
            log.error('HotSigner verifyAddress: Address mismatch')
          }
          log.error(err)
        })
        cb(err, undefined)
      } else {
        log.info('Hot signer verify address matched')
        cb(null, verified)
      }
    })
  }

  _getToken() {
    const listener = ({ type, token }: { type: string; token: string }) => {
      if (type === 'token') {
        this._token = token
        this._worker.removeListener('message', listener)
        this.ready = true
        this.emit('ready')
      }
    }
    this._worker.addListener('message', listener)
    try {
      if (this._canSendToWorker()) this._worker.send({ type: 'getToken' })
    } catch (e) {
      // Worker may have exited while the signer is being torn down.
    }
  }

  _canSendToWorker() {
    return Boolean(this._worker && this._worker.connected && (this._worker as any).channel)
  }

  _callWorker(payload: any, cb: WorkerCallback): void {
    if (!this._worker) throw Error('Worker not running')
    if (this._closed || !this._canSendToWorker()) return cb(new Error('Worker not running'))
    // If token not yet received -> retry in 100 ms
    if (!this._token) return void setTimeout(() => this._callWorker(payload, cb), 100)
    // Generate message id
    const id = uuid()
    // Handle response
    let finished = false
    const finish = (err: Error | null, result?: any) => {
      if (finished) return
      finished = true
      this._worker.removeListener('message', listener)
      this._worker.removeListener('error', fail)
      this._worker.removeListener('exit', exit)
      cb(err, result)
    }
    const fail = (err: Error) => finish(err)
    const exit = (code: number | null, signal: NodeJS.Signals | null) => {
      const suffix = signal ? ` with signal ${signal}` : code === null ? '' : ` with code ${code}`
      finish(new Error(`Worker exited${suffix}`))
    }
    const listener = (response: any) => {
      if (response.type === 'rpc' && response.id === id) {
        const error = response.error ? new Error(response.error) : null
        finish(error, response.result)
      }
    }
    this._worker.addListener('message', listener)
    this._worker.once('error', fail)
    this._worker.once('exit', exit)
    // Make RPC call
    try {
      this._worker.send({ id, token: this._token, ...payload })
    } catch (e) {
      finish(e as Error)
    }
  }
}

export default HotSigner
