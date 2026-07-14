import log from 'electron-log'
import { isValidAddress } from '@ethereumjs/util'

import {
  AccessRequest,
  AccountRequest,
  Accounts,
  RequestMode,
  SignTypedDataRequest,
  TransactionRequest
} from '..'
import nameResolution from '../../nameResolution'
import signers from '../../signers'
import windows from '../../windows'
import nav from '../../windows/nav'
import store from '../../store'
import { TransactionData } from '../../../resources/domain/transaction'
import { Type as SignerType, getSignerType } from '../../../resources/domain/signer'

import provider from '../../provider'
import { ApprovalType } from '../../../resources/constants'

import reveal from '../../reveal'
import { isTransactionRequest, isTypedMessageSignatureRequest } from '../../../resources/domain/request'
import Erc20Contract from '../../contracts/erc20'
import { getErc7730TypedDataDisplay } from '../../signatures/erc7730'
import { simulateTransactionEffects } from '../../transaction/simulation'

import type { CanonicalAccountRequest, PermitSignatureRequest, TypedMessage } from '../types'
import type { Action } from '../../transaction/actions'

function cloneSerializable<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, nextValue) => (typeof nextValue === 'function' ? undefined : nextValue))
  )
}

interface SignerOptions {
  type?: string
}

interface AccountOptions {
  address?: Address
  name: string
  ensName?: string
  created?: string
  lastSignerType?: SignerType
  options?: SignerOptions
}

class FrameAccount {
  readonly id: Address
  readonly address: Address
  readonly accounts: Accounts

  private readonly responseHandlers = new Map<string, RPCCallback<any>>()
  private readonly actionUpdateHandlers = new Map<string, Map<string, Action<unknown>>>()
  private providerConnectListener?: () => void
  private nameResolutionReadyListener?: () => void

  accountObserver: () => void

  constructor(params: AccountOptions, accounts: Accounts) {
    const { lastSignerType, name, ensName, created, address, options = {} } = params
    const formattedAddress = (address && address.toLowerCase()) || '0x'
    this.accounts = accounts // Parent Accounts Module
    this.id = formattedAddress // Account ID
    this.address = formattedAddress

    if (!store.getState().main.accounts[this.id]) {
      store.getState().upsertAccount({
        id: this.id,
        address: this.address,
        name,
        ensName,
        created: created || `new:${Date.now()}`,
        lastSignerType: lastSignerType || (options.type as SignerType) || '',
        signer: '',
        signerStatus: '',
        status: 'ok',
        requests: {}
      })
    }

    const synchronizeSigner = () => {
      // When signer data changes in any way this will rerun to make sure we're matched correctly
      const updatedSigner = this.findSigner(this.address)

      if (updatedSigner) {
        if (this.signer !== updatedSigner.id || this.signerStatus !== updatedSigner.status) {
          const signer = updatedSigner.id
          const signerType = getSignerType(updatedSigner.type)

          this.patch({
            signer,
            lastSignerType: signerType || this.lastSignerType,
            signerStatus: updatedSigner.status
          })

          if (updatedSigner.status === 'ok' && this.id === store.getState().main.currentAccount) {
            this.verifyAddress(false, (err, verified) => {
              if (!err && !verified) this.patch({ signer: '' })
            })
          }
        }
      } else {
        this.patch({ signer: '', signerStatus: '' })
      }
    }
    synchronizeSigner()
    this.accountObserver = store.subscribe((state) => state.main.signers, synchronizeSigner)

    if (this.created.split(':')[0] === 'new') {
      const createdSuffix = this.created.split(':')[1]
      this.providerConnectListener = () => {
        provider.send(
          {
            jsonrpc: '2.0',
            id: 1,
            chainId: '0x1',
            method: 'eth_blockNumber',
            _origin: 'newframe-internal',
            params: []
          },
          (response: any) => {
            if (response.result) {
              if (store.getState().main.accounts[this.id]) {
                this.patch({ created: `${parseInt(response.result, 16)}:${createdSuffix}` })
              }
              this.stopCreationBlockLookup()
            }
          }
        )
      }
      provider.on('connect', this.providerConnectListener)
    }

    if (nameResolution.ready()) {
      this.lookupAddress() // We need to recheck this on every network change...
    } else {
      this.nameResolutionReadyListener = () => {
        this.nameResolutionReadyListener = undefined
        if (store.getState().main.accounts[this.id]) void this.lookupAddress()
      }
      nameResolution.once('ready', this.nameResolutionReadyListener)
    }
  }

  private get state() {
    const account = store.getState().main.accounts[this.id]
    if (!account) throw new Error(`Account ${this.id} is not in canonical state`)
    return account as unknown as Account
  }

  get name() {
    return this.state.name
  }

  get ensName() {
    return this.state.ensName
  }

  get created() {
    return this.state.created
  }

  get lastSignerType() {
    return this.state.lastSignerType
  }

  get signer() {
    return this.state.signer
  }

  get signerStatus() {
    return this.state.signerStatus || ''
  }

  get status() {
    return this.state.status
  }

  get requests() {
    return this.state.requests as Record<string, AccountRequest>
  }

  patch(update: Partial<Omit<Account, 'id' | 'address' | 'requests'>>) {
    store.getState().patchAccount(this.id, update)
  }

  patchRequest<T extends AccountRequest>(id: string, update: (request: T) => void) {
    store.getState().patchAccountRequest(this.id, id, update as (request: CanonicalAccountRequest) => void)
    return this.getRequest<T>(id)
  }

  async lookupAddress() {
    try {
      this.patch({ ensName: await nameResolution.reverseLookup(this.address) })
    } catch (e) {
      log.error('lookupAddress Error:', e)
      this.patch({ ensName: '' })
    }
  }

  findSigner(address: Address) {
    const signers = store.getState().main.signers as Record<string, Signer>

    const signerOrdinal = (signer: Signer) => {
      const isOk = signer.status === 'ok' ? 2 : 1
      const signerIndex = Object.values(SignerType).findIndex((type) => type === signer.type)
      const typeIndex = Math.max(signerIndex, 0)

      return isOk * typeIndex
    }

    const availableSigners = Object.values(signers)
      .filter((signer) => signer.addresses.some((addr) => addr.toLowerCase() === address))
      .sort((a, b) => signerOrdinal(b) - signerOrdinal(a))

    return availableSigners[0]
  }

  setAccess(req: AccessRequest, access: boolean) {
    const { handlerId, origin, account } = req
    if (account.toLowerCase() === this.address) {
      // Permissions do not live inside the account summary
      if (access) {
        const { name } = store.getState().main.origins[origin]
        store.getState().setPermission(this.address, { handlerId, origin: name, provider: true })
      } else {
        store.getState().revokePermission(this.address, handlerId)
      }
    }

    this.resolveRequest(req)
  }

  getRequest<T extends AccountRequest>(id: string) {
    return this.requests[id] as T
  }

  resolveRequest({ handlerId, payload }: AccountRequest, result?: any) {
    const knownRequest = this.requests[handlerId]

    if (knownRequest) {
      const respond = this.responseHandlers.get(handlerId)
      if (respond && payload) {
        const { id, jsonrpc } = payload
        respond({ id, jsonrpc, result })
      }

      this.clearRequest(knownRequest.handlerId)
    }
  }

  rejectRequest({ handlerId, payload }: AccountRequest, error: EVMError) {
    const knownRequest = this.requests[handlerId]

    if (knownRequest) {
      const respond = this.responseHandlers.get(handlerId)
      if (respond && payload) {
        const { id, jsonrpc } = payload
        respond({ id, jsonrpc, error })
      }

      this.clearRequest(knownRequest.handlerId)
    }
  }

  clearRequest(handlerId: string) {
    log.info(`clearRequest(${handlerId}) for account ${this.id}`)

    const panelNav = (store.getState().windows.panel.nav || []) as any[]
    const wasCurrentRequest =
      panelNav[0]?.view === 'requestView' && panelNav[0]?.data?.requestId === handlerId

    store.getState().removeAccountRequest(this.id, handlerId)
    this.responseHandlers.delete(handlerId)
    this.actionUpdateHandlers.delete(handlerId)
    store.getState().navClearReq(handlerId, Object.keys(this.requests).length > 0)

    const nextRequest = Object.values(this.requests)
      .filter(
        (req) =>
          req.mode !== RequestMode.Monitor &&
          !['confirmed', 'declined', 'error', 'success'].includes(req.status || '')
      )
      .sort((a, b) => (a.created || 0) - (b.created || 0))[0]

    if (wasCurrentRequest && nextRequest) {
      if (isTransactionRequest(nextRequest)) {
        void this.simulateTransaction(nextRequest, true)
      }

      nav.forward('panel', {
        view: 'requestView',
        data: {
          step: 'confirm',
          accountId: this.id,
          requestId: nextRequest.handlerId
        }
      })
    }
  }

  clearRequestsByOrigin(origin: string) {
    Object.entries(this.requests).forEach(([_handlerId, req]) => {
      if (req.origin === origin) {
        const err = { code: 4001, message: 'User rejected the request' }
        this.rejectRequest(req, err)
      }
    })
  }

  approveRequest(reqId: string, type: ApprovalType, _data: any) {
    const request = this.getRequest<TransactionRequest>(reqId)
    const approval = request?.approvals?.find((candidate) => candidate.type === type)
    if (!approval) return false

    this.patchRequest<TransactionRequest>(reqId, (draft) => {
      const confirmed = draft.approvals.find((candidate) => candidate.type === type)
      if (confirmed) confirmed.approved = true
    })
    return true
  }

  updateRecognizedAction(reqId: string, actionId: string, data: any) {
    const runtimeAction = this.actionUpdateHandlers.get(reqId)?.get(actionId)
    if (!runtimeAction?.update) return false

    this.patchRequest<TransactionRequest>(reqId, (request) => {
      runtimeAction.update?.(request, data)
      const canonicalAction = request.recognizedActions.find((action) => action.id === actionId)
      if (canonicalAction) canonicalAction.data = cloneSerializable(runtimeAction.data)
    })
    return true
  }

  resError(err: string | Error, payload: RPCResponsePayload, res: RPCErrorCallback) {
    const error = typeof err === 'string' ? { message: err, code: -1 } : err

    log.error(error)

    res({ id: payload.id, jsonrpc: payload.jsonrpc, error })
  }

  private async recipientIdentity(req: TransactionRequest) {
    const { to } = req.data

    if (to) {
      // Get recipient identity
      try {
        const recipient = await reveal.identity(to)
        const knownTxRequest = this.requests[req.handlerId] as TransactionRequest

        if (recipient && knownTxRequest) {
          const updated = this.patchRequest<TransactionRequest>(req.handlerId, (request) => {
            request.recipient = recipient.ens
          })
          if (updated) this.accounts.syncTransactionActivity?.(this, updated)
        }
      } catch (e) {
        log.warn(e)
      }
    }
  }

  private async decodeCalldata(req: TransactionRequest) {
    const { to, chainId, data: calldata } = req.data

    if (to && calldata && calldata !== '0x' && parseInt(calldata, 16) !== 0) {
      try {
        // Decode calldata
        const decodedData = await reveal.decode(to, parseInt(chainId, 16), calldata)

        const knownTxRequest = this.requests[req.handlerId] as TransactionRequest

        if (knownTxRequest && decodedData) {
          const updated = this.patchRequest<TransactionRequest>(req.handlerId, (request) => {
            request.decodedData = decodedData
          })
          if (updated) {
            this.accounts.syncTransactionActivity?.(this, updated)
            void this.enrichErc20TokenData(updated)
          }
        }
      } catch (e) {
        log.warn(e)
      }
    }
  }

  private async enrichErc20TokenData(req: TransactionRequest) {
    const { to, chainId } = req.data
    const signature = req.decodedData?.signature

    if (
      !to ||
      !chainId ||
      !['approve(address,uint256)', 'transfer(address,uint256)'].includes(signature || '')
    ) {
      return
    }

    try {
      const contract = new Erc20Contract(to, parseInt(chainId, 16))
      const tokenData = await contract.getTokenData()
      const knownTxRequest = this.requests[req.handlerId] as TransactionRequest

      if (knownTxRequest) {
        const updated = this.patchRequest<TransactionRequest>(req.handlerId, (request) => {
          request.tokenData = tokenData
        })
        if (updated) this.accounts.syncTransactionActivity?.(this, updated)
      }
    } catch (e) {
      log.warn('unable to fetch erc20 token metadata', { handlerId: req.handlerId, to, chainId, error: e })
    }
  }

  private async simulateTransaction(req: TransactionRequest, force = false) {
    const knownTxRequest = this.requests[req.handlerId] as TransactionRequest | undefined
    if (!knownTxRequest) return
    if (!knownTxRequest.data?.chainId) return
    if (!force && knownTxRequest.simulation?.status === 'loading') return

    this.patchRequest<TransactionRequest>(req.handlerId, (request) => {
      request.simulation = {
        status: 'loading',
        effects: request.simulation?.effects,
        updatedAt: Date.now()
      }
    })

    const simulation = await simulateTransactionEffects(this.getRequest<TransactionRequest>(req.handlerId))
    const currentTxRequest = this.requests[req.handlerId] as TransactionRequest | undefined

    if (currentTxRequest) {
      const updated = this.patchRequest<TransactionRequest>(req.handlerId, (request) => {
        request.simulation = simulation
      })
      if (updated) this.accounts.syncTransactionActivity?.(this, updated)
    }
  }

  private async recognizeActions(req: TransactionRequest) {
    const { to, chainId, data: calldata } = req.data

    if (to && calldata && calldata !== '0x' && parseInt(calldata, 16) !== 0) {
      try {
        // Recognize actions
        const actions = await reveal.recog(calldata, {
          contractAddress: to,
          chainId: parseInt(chainId, 16),
          account: this.address
        })

        const knownTxRequest = this.requests[req.handlerId] as TransactionRequest

        if (knownTxRequest && actions) {
          const handlers = new Map<string, Action<unknown>>()
          const recognizedActions = actions.map(({ update, ...action }) => {
            if (update) handlers.set(action.id, { ...action, update })
            return cloneSerializable(action)
          })
          this.actionUpdateHandlers.set(req.handlerId, handlers)
          const updated = this.patchRequest<TransactionRequest>(req.handlerId, (request) => {
            request.recognizedActions = recognizedActions
          })
          if (updated) this.accounts.syncTransactionActivity?.(this, updated)
        }
      } catch (e) {
        log.warn(e)
      }
    }
  }

  private async decodeErc7730TypedMessage(req: SignTypedDataRequest) {
    const knownRequest = this.requests[req.handlerId]
    if (!knownRequest) return

    try {
      const erc7730 = await getErc7730TypedDataDisplay(req.typedMessage)
      const updatedRequest = this.requests[req.handlerId] as SignTypedDataRequest | undefined
      if (!erc7730 || !updatedRequest) return

      this.patchRequest<SignTypedDataRequest>(req.handlerId, (request) => {
        request.erc7730 = erc7730
      })
    } catch (error) {
      log.warn('unable to decode ERC-7730 typed message', { error, handlerId: req.handlerId })
    }
  }

  private async decodeTypedMessage(req: SignTypedDataRequest) {
    void this.decodeErc7730TypedMessage(req)

    if (req.type === 'signTypedData') return

    const knownRequest = this.requests[req.handlerId]
    if (!knownRequest) return

    try {
      const permitRequest = knownRequest as PermitSignatureRequest
      const { permit } = permitRequest

      const contract = new Erc20Contract(permit.verifyingContract.address, Number(permit.chainId))
      const [tokenData, contractIdentity, spenderIdentity] = await Promise.all([
        contract.getTokenData(),
        reveal.identity(permit.verifyingContract.address),
        reveal.identity(permit.spender.address)
      ])

      this.patchRequest<PermitSignatureRequest>(req.handlerId, (request) => {
        Object.assign(request, {
          tokenData,
          permit: {
            ...permit,
            verifyingContract: { ...permit.verifyingContract, ...contractIdentity },
            spender: { ...permit.spender, ...spenderIdentity }
          }
        })
      })
    } catch (error) {
      log.warn('unable to decode typed message', { error, handlerId: req.handlerId })
    }
  }

  private async revealDetails(req?: AccountRequest) {
    if (!req) return

    if (isTransactionRequest(req)) {
      this.recipientIdentity(req)
      this.decodeCalldata(req)
      this.recognizeActions(req)
      void this.simulateTransaction(req)
      return
    }

    if (isTypedMessageSignatureRequest(req)) {
      this.decodeTypedMessage(req)
    }
  }

  addRequest(req: any, res: RPCCallback<any> = () => {}) {
    const add = (r: AccountRequest) => {
      this.responseHandlers.set(r.handlerId, res)

      const actionHandlers = new Map<string, Action<unknown>>()
      ;((req as any).recognizedActions || []).forEach((action: any) => {
        if (typeof action.update === 'function') actionHandlers.set(action.id, action)
      })
      if (actionHandlers.size) this.actionUpdateHandlers.set(r.handlerId, actionHandlers)

      const request = cloneSerializable({
        ...req,
        mode: RequestMode.Normal,
        created: Date.now()
      }) as CanonicalAccountRequest
      store.getState().upsertAccountRequest(this.id, request)

      this.revealDetails(request)

      // Display request
      const { account } = req

      // Check if this account is open
      const accountOpen = store.getState().main.currentAccount === account

      // Does the current panel nav include a 'requestView'
      const panelNav = (store.getState().windows.panel.nav || []) as any[]
      const inExpandedRequestsView =
        panelNav[0]?.view === 'expandedModule' && panelNav[0]?.data?.id === 'requests'
      const inRequestView = panelNav.map((crumb: any) => crumb.view).includes('requestView')

      if (!accountOpen) {
        store.getState().setAccount({ id: this.id })
      }

      if (!inRequestView) {
        if (inExpandedRequestsView) {
          nav.back('panel')
        }

        nav.forward('panel', {
          view: 'expandedModule',
          data: {
            id: 'requests',
            account: account
          }
        })

        const crumb = {
          view: 'requestView',
          data: {
            step: 'confirm',
            accountId: account,
            requestId: req.handlerId
          }
        } as const
        nav.forward('panel', crumb)
      }

      setTimeout(() => {
        windows.showTray()
      }, 100)
    }

    add(req)
  }

  getSigner() {
    return this.signer ? signers.get(this.signer) : undefined
  }

  verifyAddress(display: boolean, cb: Callback<boolean>) {
    const signer = signers.get(this.signer) || {}

    if (signer.verifyAddress && signer.status === 'ok') {
      const index = signer.addresses.map((a) => a.toLowerCase()).indexOf(this.address)
      if (index > -1) {
        signer.verifyAddress(index, this.address, display, cb)
      } else {
        log.info('Could not find address in signer')
        cb(new Error('Could not find address in signer'))
      }
    } else {
      log.info('Signer not accessible to verify address')
      cb(new Error('Signer not accessible to verify address'))
    }
  }

  getSelectedAddresses() {
    return [this.address]
  }

  getSelectedAddress() {
    return this.address
  }

  rename(name: string) {
    this.patch({ name })
  }

  getCoinbase(cb: Callback<Array<Address>>) {
    cb(null, [this.address])
  }

  getAccounts(cb?: Callback<Array<Address>>) {
    const account = this.address
    if (cb) cb(null, account ? [account] : [])
    return account ? [account] : []
  }

  private stopCreationBlockLookup() {
    if (!this.providerConnectListener) return
    provider.off('connect', this.providerConnectListener)
    this.providerConnectListener = undefined
  }

  close() {
    this.stopCreationBlockLookup()
    if (this.nameResolutionReadyListener) {
      nameResolution.off('ready', this.nameResolutionReadyListener)
      this.nameResolutionReadyListener = undefined
    }
    this.responseHandlers.clear()
    this.actionUpdateHandlers.clear()
    this.accountObserver()
  }

  signMessage(message: string, cb: Callback<string>) {
    if (!message) return cb(new Error('No message to sign'))
    if (this.signer) {
      const s = signers.get(this.signer)
      if (!s) return cb(new Error(`Cannot find signer for this account`))
      const index = s.addresses.map((a) => a.toLowerCase()).indexOf(this.address)
      if (index === -1) cb(new Error(`Signer cannot sign for this address`))
      s.signMessage(index, message, cb)
    } else {
      cb(new Error('No signer found for this account'))
    }
  }

  signTypedData(typedMessage: TypedMessage, cb: Callback<string>) {
    if (!typedMessage.data) return cb(new Error('No data to sign'))
    if (typeof typedMessage.data !== 'object') return cb(new Error('Data to sign has the wrong format'))
    if (this.signer) {
      const s = signers.get(this.signer)
      if (!s) return cb(new Error(`Cannot find signer for this account`))
      const index = s.addresses.map((a) => a.toLowerCase()).indexOf(this.address)
      if (index === -1) cb(new Error(`Signer cannot sign for this address`))
      s.signTypedData(index, typedMessage, cb)
    } else {
      cb(new Error('No signer found for this account'))
    }
  }

  signTransaction(rawTx: TransactionData, cb: Callback<string>) {
    // if(index === typeof 'object' && cb === typeof 'undefined' && typeof rawTx === 'function') cb = rawTx; rawTx = index; index = 0;
    this.validateTransaction(rawTx, (err) => {
      if (err) return cb(err)
      if (this.signer) {
        const s = signers.get(this.signer)
        if (!s) return cb(new Error(`Cannot find signer for this account`))

        const index = s.addresses.map((a) => a.toLowerCase()).indexOf(this.address)
        if (index === -1) cb(new Error(`Signer cannot sign for this address`))
        s.signTransaction(index, rawTx, cb)
      } else {
        cb(new Error('No signer found for this account'))
      }
    })
  }

  private validateTransaction(rawTx: TransactionData, cb: Callback<void>) {
    // Validate 'from' address
    if (!rawTx.from) return new Error("Missing 'from' address")
    if (!isValidAddress(rawTx.from)) return cb(new Error("Invalid 'from' address"))

    // Ensure that transaction params are valid hex strings
    const enforcedKeys: Array<keyof TransactionData> = [
      'value',
      'data',
      'to',
      'from',
      'gas',
      'gasPrice',
      'gasLimit',
      'nonce'
    ]
    const keys = Object.keys(rawTx) as Array<keyof TransactionData>

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      if (enforcedKeys.indexOf(key) > -1 && !this.isValidHexString(rawTx[key] as string)) {
        // Break on first error
        cb(new Error(`Transaction parameter '${String(key)}' is not a valid hex string`))
        break
      }
    }
    return cb(null)
  }

  private isValidHexString(str: string) {
    const pattern = /^0x[0-9a-fA-F]*$/
    return pattern.test(str)
  }
}

export default FrameAccount
