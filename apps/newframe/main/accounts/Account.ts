import log from 'electron-log'
import { isValidAddress } from '@ethereumjs/util'

import { RequestMode } from '../../contracts/requests.js'
import type {
  AccessRequest,
  AccountRequest,
  CanonicalAccountRequest,
  PermitSignatureRequest,
  SignTypedDataRequest,
  TransactionRequest,
  TypedMessage
} from '../../contracts/requests.js'
import type { Accounts } from './index.js'
import type { NameResolutionService } from '../nameResolution.js'
import { TransactionData } from '../../domain/transaction/index.js'
import { Type as SignerType, getSignerType } from '../../domain/signer/index.js'

import { ApprovalType } from '../../domain/request/approval.js'

import type { RevealService } from '../reveal.js'
import { isTransactionRequest, isTypedMessageSignatureRequest } from '../../domain/request/index.js'
import Erc20Contract from '../contracts/erc20.js'
import { getErc7730TypedDataDisplay } from '../signatures/erc7730.js'
import type { TransactionSimulationPort } from '../features/transactions/simulationPort.js'

import type { Action } from '../transaction/actions/index.js'
import type { AccountChainRpcPort } from './providerPort.js'
import type { AccountsRuntime } from './runtime.js'
import type { CanonicalStoreReader } from '../store/actions.js'
import type { PromptedRequestLifecyclePort } from '../features/requests/service.js'

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

  private readonly actionUpdateHandlers = new Map<string, Map<string, Action<unknown>>>()
  private providerConnectListener?: () => void
  private nameResolutionReadyListener?: () => void
  private creationBlockLookupPending = false
  private addressLookupPending = false
  private profileActive: boolean

  accountObserver: () => void

  constructor(
    params: AccountOptions,
    accounts: Accounts,
    private readonly store: CanonicalStoreReader,
    private readonly chainRpc: AccountChainRpcPort,
    private readonly simulation: TransactionSimulationPort,
    private readonly nameResolution: NameResolutionService,
    private readonly reveal: RevealService,
    private readonly runtime: AccountsRuntime,
    private readonly requestLifecycle: PromptedRequestLifecyclePort,
    profileActive = true
  ) {
    const { lastSignerType, name, ensName, created, address, options = {} } = params
    const formattedAddress = (address && address.toLowerCase()) || '0x'
    this.accounts = accounts // Parent Accounts Module
    this.id = formattedAddress // Account ID
    this.address = formattedAddress
    this.profileActive = profileActive

    if (!this.store.getState().main.accounts[this.id]) {
      this.store.getState().upsertAccount({
        id: this.id,
        address: this.address,
        name,
        ensName,
        created: created || `new:${this.runtime.now()}`,
        lastSignerType: lastSignerType || (options.type as SignerType) || '',
        signer: '',
        signerStatus: '',
        agentEnabled: false,
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

          if (updatedSigner.status === 'ok' && this.id === this.store.getState().main.currentAccount) {
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
    this.accountObserver = this.store.subscribe((state) => state.main.signers, synchronizeSigner)

    this.startProfileNetworkActivity()
  }

  private get state() {
    const account = this.store.getState().main.accounts[this.id]
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

  get agentEnabled() {
    return this.state.agentEnabled === true
  }

  get status() {
    return this.state.status
  }

  get requests() {
    return this.state.requests as Record<string, AccountRequest>
  }

  patch(update: Partial<Omit<Account, 'id' | 'address' | 'requests'>>) {
    this.store.getState().patchAccount(this.id, update)
  }

  patchRequest<T extends AccountRequest>(id: string, update: (request: T) => void) {
    this.store
      .getState()
      .patchAccountRequest(this.id, id, update as (request: CanonicalAccountRequest) => void)
    return this.getRequest<T>(id)
  }

  async lookupAddress() {
    if (!this.profileActive || this.addressLookupPending) return

    this.addressLookupPending = true
    try {
      const ensName = await this.nameResolution.reverseLookup(this.address)
      if (this.store.getState().main.accounts[this.id]) this.patch({ ensName })
    } catch (e) {
      log.error('lookupAddress Error:', e)
      if (this.store.getState().main.accounts[this.id]) this.patch({ ensName: '' })
    } finally {
      this.addressLookupPending = false
    }
  }

  findSigner(address: Address) {
    const signers = this.store.getState().main.signers as Record<string, Signer>

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
        const { name } = this.store.getState().main.origins[origin]
        this.store.getState().setPermission(this.address, { handlerId, origin: name, provider: true })
      } else {
        this.store.getState().revokePermission(this.address, handlerId)
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
      if (payload) this.requestLifecycle.resolve(knownRequest, result)

      this.clearRequest(knownRequest.handlerId)
    }
  }

  rejectRequest({ handlerId, payload }: AccountRequest, error: EVMError) {
    const knownRequest = this.requests[handlerId]

    if (knownRequest) {
      if (payload) this.requestLifecycle.reject(knownRequest, error)

      this.clearRequest(knownRequest.handlerId)
    }
  }

  clearRequest(handlerId: string) {
    log.info(`clearRequest(${handlerId}) for account ${this.id}`)

    const panelNav = (this.store.getState().windows.panel.nav || []) as any[]
    const wasCurrentRequest =
      panelNav[0]?.view === 'requestView' && panelNav[0]?.data?.requestId === handlerId

    this.store.getState().removeAccountRequest(this.id, handlerId)
    this.actionUpdateHandlers.delete(handlerId)
    this.store.getState().navClearReq(handlerId, Object.keys(this.requests).length > 0)

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

      this.runtime.navigation.forward('panel', {
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
        const recipient = await this.reveal.identity(to)
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
        const decodedData = await this.reveal.decode(to, parseInt(chainId, 16), calldata)

        const knownTxRequest = this.requests[req.handlerId] as TransactionRequest

        if (knownTxRequest && decodedData) {
          const updated = this.patchRequest<TransactionRequest>(req.handlerId, (request) => {
            request.decodedData = decodedData
          })
          if (updated) {
            this.accounts.syncTransactionActivity?.(this, updated)
            await this.enrichErc20TokenData(updated)
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
      const contract = new Erc20Contract(to, parseInt(chainId, 16), this.chainRpc)
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
        updatedAt: this.runtime.now()
      }
    })

    const simulation = await this.simulation.simulateTransactionEffects(
      this.getRequest<TransactionRequest>(req.handlerId)
    )
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
        const actions = await this.reveal.recog(calldata, {
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

      const contract = new Erc20Contract(
        permit.verifyingContract.address,
        Number(permit.chainId),
        this.chainRpc
      )
      const [tokenData, contractIdentity, spenderIdentity] = await Promise.all([
        contract.getTokenData(),
        this.reveal.identity(permit.verifyingContract.address),
        this.reveal.identity(permit.spender.address)
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
      void this.recipientIdentity(req)
      void this.decodeCalldata(req)
      await this.recognizeActions(req)

      const enrichedRequest = this.requests[req.handlerId] as TransactionRequest | undefined
      if (enrichedRequest) await this.simulateTransaction(enrichedRequest)
      return
    }

    if (isTypedMessageSignatureRequest(req)) {
      this.decodeTypedMessage(req)
    }
  }

  addRequest(req: any) {
    const add = (r: AccountRequest) => {
      const actionHandlers = new Map<string, Action<unknown>>()
      ;((req as any).recognizedActions || []).forEach((action: any) => {
        if (typeof action.update === 'function') actionHandlers.set(action.id, action)
      })
      if (actionHandlers.size) this.actionUpdateHandlers.set(r.handlerId, actionHandlers)

      const request = cloneSerializable({
        ...req,
        mode: RequestMode.Normal,
        created: this.runtime.now()
      }) as CanonicalAccountRequest
      this.store.getState().upsertAccountRequest(this.id, request)

      void this.revealDetails(request)

      // Display request
      const { account } = req

      // Check if this account is open
      const accountOpen = this.store.getState().main.currentAccount === account

      // Does the current panel nav include a 'requestView'
      const panelNav = (this.store.getState().windows.panel.nav || []) as any[]
      const inExpandedRequestsView =
        panelNav[0]?.view === 'expandedModule' && panelNav[0]?.data?.id === 'requests'
      const inRequestView = panelNav.map((crumb: any) => crumb.view).includes('requestView')

      if (!accountOpen) {
        this.store.getState().setAccount({ id: this.id })
      }

      if (!inRequestView) {
        if (inExpandedRequestsView) {
          this.runtime.navigation.back('panel')
        }

        const crumb = {
          view: 'requestView',
          data: {
            step: 'confirm',
            accountId: account,
            requestId: req.handlerId
          }
        } as const
        this.runtime.navigation.forward('panel', crumb)
      }

      this.runtime.schedule(() => {
        this.runtime.windows.showTray()
      }, 100)
    }

    add(req)
  }

  getSigner() {
    return this.signer ? this.runtime.signers.get(this.signer) : undefined
  }

  verifyAddress(display: boolean, cb: Callback<boolean>) {
    const signer = this.runtime.signers.get(this.signer)

    if (signer?.verifyAddress && signer.status === 'ok') {
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

  private startProfileNetworkActivity() {
    if (!this.profileActive) return

    this.startCreationBlockLookup()
    this.startNameResolutionLookup()
  }

  private startCreationBlockLookup() {
    if (
      !this.profileActive ||
      this.creationBlockLookupPending ||
      this.providerConnectListener ||
      this.created.split(':')[0] !== 'new'
    ) {
      return
    }

    const createdSuffix = this.created.split(':')[1]
    this.providerConnectListener = () => {
      if (!this.profileActive || this.creationBlockLookupPending) return

      this.creationBlockLookupPending = true
      this.chainRpc.send(
        {
          jsonrpc: '2.0',
          id: 1,
          chainId: '0x1',
          method: 'eth_blockNumber',
          _origin: 'newframe-internal',
          params: []
        },
        (response: any) => {
          this.creationBlockLookupPending = false
          if (response.result) {
            if (this.store.getState().main.accounts[this.id]) {
              this.patch({ created: `${parseInt(response.result, 16)}:${createdSuffix}` })
            }
            this.stopCreationBlockLookup()
          } else if (this.profileActive && !this.providerConnectListener) {
            this.startCreationBlockLookup()
          }
        }
      )
    }
    this.chainRpc.on('connect', this.providerConnectListener)
  }

  private startNameResolutionLookup() {
    if (!this.profileActive || this.addressLookupPending || this.nameResolutionReadyListener) return

    if (this.nameResolution.ready()) {
      void this.lookupAddress()
      return
    }

    this.nameResolutionReadyListener = () => {
      this.nameResolutionReadyListener = undefined
      if (this.profileActive && this.store.getState().main.accounts[this.id]) void this.lookupAddress()
    }
    this.nameResolution.once('ready', this.nameResolutionReadyListener)
  }

  setProfileActive(active: boolean) {
    if (this.profileActive === active) return

    this.profileActive = active
    if (active) {
      this.startProfileNetworkActivity()
    } else {
      this.stopCreationBlockLookup()
      this.stopNameResolutionReadyLookup()
    }
  }

  private stopCreationBlockLookup() {
    if (!this.providerConnectListener) return
    this.chainRpc.off('connect', this.providerConnectListener)
    this.providerConnectListener = undefined
  }

  private stopNameResolutionReadyLookup() {
    if (!this.nameResolutionReadyListener) return

    this.nameResolution.off('ready', this.nameResolutionReadyListener)
    this.nameResolutionReadyListener = undefined
  }

  close() {
    this.profileActive = false
    this.stopCreationBlockLookup()
    this.stopNameResolutionReadyLookup()
    this.actionUpdateHandlers.clear()
    this.accountObserver()
  }

  signMessage(message: string, cb: Callback<string>) {
    if (!message) return cb(new Error('No message to sign'))
    if (this.signer) {
      const s = this.runtime.signers.get(this.signer)
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
      const s = this.runtime.signers.get(this.signer)
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
        const s = this.runtime.signers.get(this.signer)
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
