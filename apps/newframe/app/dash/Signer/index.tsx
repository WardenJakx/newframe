import React, { useCallback, useState } from 'react'

import link from '../../../resources/link'
import svg from '../../../resources/svg'
import { getAddress } from '../../../resources/utils'
import { isHardwareSigner } from '../../../resources/domain/signer'

import ReloadSignerButton from './ReloadSignerButton'
import { useWalletSelector } from '../../state/useAppSelector'
import type { DashRendererState, DashSigner } from '../state'

function isLoading(status = '') {
  const statusToCheck = status.toLowerCase()
  return ['loading', 'connecting', 'addresses', 'input', 'pairing'].some((s) => statusToCheck.includes(s))
}

interface SignerOwnProps {
  expanded?: boolean
  id: string
  index?: number
}

interface SignerViewProps extends DashSigner, SignerOwnProps {
  accounts: Record<string, unknown>
  liveAccountLimit: number
  signer: DashSigner
}

interface SignerViewState {
  addressLimit: number
  latticePairCode: string
  page: number
  tPhrase: string
  tPin: string
}

function SignerView(props: SignerViewProps) {
  const [state, setSignerState] = useState<SignerViewState>({
    page: 0,
    addressLimit: 5,
    latticePairCode: '',
    tPin: '',
    tPhrase: ''
  })
  const setState = (update: Partial<SignerViewState>) =>
    setSignerState((current) => ({ ...current, ...update }))

  function backspacePin(e: any) {
    e.stopPropagation()
    setState({ tPin: state.tPin ? state.tPin.slice(0, -1) : '' })
  }

  function trezorPin(num: any) {
    setState({ tPin: state.tPin + num.toString() })
  }

  function submitPin() {
    void link.executeCommand({
      type: 'signer.trezor-input',
      signerId: props.id,
      input: 'pin',
      value: state.tPin
    })
    setState({ tPin: '' })
  }

  function submitPhrase() {
    const phrase = state.tPhrase || ''
    setState({ tPhrase: '' })
    void link.executeCommand({
      type: 'signer.trezor-input',
      signerId: props.id,
      input: 'passphrase',
      value: phrase
    })
  }

  function renderTrezorPin(active: any) {
    return (
      <div className='trezorPinWrap' style={active ? {} : { height: '0px', padding: '0px 0px 0px 0px' }}>
        {active ? (
          <>
            <div className='trezorPhraseInput'>
              {state.tPin.split('').map((n: any, i: any) => {
                return (
                  <div key={i} className='trezorPinInputButton' onMouseDown={() => trezorPin(i)}>
                    {svg.octicon('primitive-dot', { height: 14 })}
                  </div>
                )
              })}
            </div>
            <div
              className='signerPinMessage signerPinSubmit'
              onMouseDown={(state.tPin ? () => submitPin() : null) as any}
            >
              Submit Pin
              {state.tPin ? (
                <div className='signerPinDelete' onMouseDown={backspacePin}>
                  {svg.octicon('chevron-left', { height: 18 })}
                </div>
              ) : null}
            </div>
            <div className='trezorPinInputWrap'>
              <div className='trezorPinInput'>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
                  <div key={i} className='trezorPinInputButton' onMouseDown={() => trezorPin(i)}>
                    {svg.octicon('primitive-dot', { height: 20 })}
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>
    )
  }

  function phraseKeyPress(e: any) {
    if (e.key === 'Enter') {
      e.preventDefault()
      submitPhrase()
    }
  }

  function renderTrezorPhrase(active: any) {
    const allowsDeviceEntry = (props.capabilities || []).includes('Capability_PassphraseEntry')

    return (
      <div className='trezorPinWrap' style={active ? {} : { height: '0px', padding: '0px 0px 0px 0px' }}>
        {active ? (
          <>
            <div className='trezorPhraseInput'>
              <input
                type='password'
                onChange={(e) => setState({ tPhrase: e.target.value })}
                onKeyPress={(e) => phraseKeyPress(e)}
                autoFocus
              />
            </div>
            <div
              className='signerPinMessage signerPinSubmit'
              onMouseDown={(evt) => {
                if (evt.button === 0) {
                  // left click only
                  submitPhrase()
                }
              }}
            >
              Submit Passphrase
            </div>
            {allowsDeviceEntry ? (
              <>
                <div className='signerPinMessageOr'>{'or'}</div>
                <div
                  className='signerPinMessage signerPinSubmit'
                  onMouseDown={(evt) => {
                    if (evt.button === 0) {
                      // left click only
                      void link.executeCommand({
                        type: 'signer.trezor-input',
                        signerId: props.id,
                        input: 'device-passphrase'
                      })
                    }
                  }}
                >
                  Enter passphrase on device
                </div>
              </>
            ) : (
              <></>
            )}
          </>
        ) : null}
      </div>
    )
  }

  function getStatus() {
    return (props.status || '').toLowerCase()
  }

  function statusText() {
    const status = getStatus()

    if (status === 'ok') {
      return <div className='signerStatusText signerStatusReady'>{'ready to sign'}</div>
    } else if (status === 'locked') {
      const hwSigner = isHardwareSigner(props.type)
      const lockText = hwSigner ? 'Please unlock your ' + props.type : 'locked'

      const classes = hwSigner ? 'signerStatusText' : 'signerStatusText signerStatusIssue'
      return <div className={classes}>{lockText}</div>
    } else if (status === 'addresses') {
      return <div className='signerStatusText'>{'deriving addresses'}</div>
    } else {
      return <div className='signerStatusText'>{props.status}</div>
    }
  }

  function nextPage(backwards?: any) {
    let page = backwards ? state.page - 1 : state.page + 1
    const { signer } = props
    const maxPage = Math.ceil(signer.addresses.length / state.addressLimit) - 1
    if (page > maxPage) page = maxPage
    if (page < 0) page = 0
    setState({ page })
  }

  function pairToLattice() {
    void link.executeCommand({
      type: 'signer.lattice-pair',
      signerId: props.id,
      pairCode: state.latticePairCode
    })

    setState({ latticePairCode: '' })
  }

  function expand(id: any) {
    void link.executeCommand({
      type: 'dash.navigate',
      view: 'expandedSigner',
      data: { signer: id }
    })
  }

  function renderPreview() {
    const { accounts, signer } = props
    const status = getStatus()

    const hwSigner = isHardwareSigner(props.type)
    const loading = isLoading(status)

    // TODO: create well-defined signer states that drive these UI features
    // const canReconnect =
    //   props.type !== 'trezor' || status === 'disconnected' || status.includes('reconnect')

    // UI changes for this status only apply to hot signers
    const isLocked = !hwSigner && status === 'locked'

    let signerClass = 'signer'
    if (status === 'ok') signerClass += ' signerOk'
    if (isLocked) signerClass += ' signerLocked'

    const addedAccounts = signer.addresses.filter((address: any) => {
      return Boolean(accounts[address.toLowerCase()])
    })

    const zIndex = 1000 - (props.index || 0)

    return (
      <div className={signerClass + ' cardShow'} style={{ zIndex }}>
        <div className='signerTop'>
          <div className='signerDetails'>
            <div className='signerIcon'>
              {((_) => {
                const type = props.type
                if (type === 'ledger')
                  return <div className='signerIconWrap signerIconHardware'>{svg.ledger(20)}</div>
                if (type === 'trezor')
                  return <div className='signerIconWrap signerIconHardware'>{svg.trezor(20)}</div>
                if (type === 'seed' || type === 'ring')
                  return <div className='signerIconWrap signerIconHot'>{svg.flame(23)}</div>
                if (type === 'lattice')
                  return <div className='signerIconWrap signerIconSmart'>{svg.lattice(22)}</div>
                return <div className='signerIconWrap'>{svg.logo(20)}</div>
              })()}
            </div>
            {/* <div className='signerType' style={props.inSetup ? {top: '21px'} : {top: '24px'}}>{props.model}</div> */}
            <div className='signerName'>
              {props.name}
              {/* <div className='signerNameUpdate'>
                {svg.save(14)}
              </div> */}
            </div>
          </div>
          <div className='signerExpand' onClick={() => expand(signer.id)}>
            {svg.bars(14)}
          </div>
          {/* {this.status()} */}
        </div>
        {statusText()}
        {status === 'ok' || isLocked ? (
          <>
            <div className='signerAddedAccountTitle'>
              {addedAccounts.length ? 'active accounts' : 'no active accounts'}
            </div>
            <div className='signerAccounts'>
              {addedAccounts.length ? (
                addedAccounts.map((address: any) => {
                  const index = signer.addresses.indexOf(address) + 1
                  const checkSummedAddress = getAddress(address)
                  return (
                    <div
                      key={address}
                      className={'signerAccount signerAccountAdded signerAccountDisabled'}
                      onClick={() => {
                        // Account changes are intentionally disabled in the preview.
                      }}
                    >
                      <div className='signerAccountIndex'>{index}</div>
                      <div className='signerAccountAddress'>
                        {checkSummedAddress.substr(0, 11)} {svg.octicon('kebab-horizontal', { height: 20 })}{' '}
                        {checkSummedAddress.substr(address.length - 10)}
                      </div>
                      <div className='signerAccountCheck' />
                    </div>
                  )
                })
              ) : (
                <div className='signerAccountsAdd' onClick={() => expand(signer.id)}>
                  {'View available accounts'}
                </div>
              )}
            </div>
          </>
        ) : loading ? (
          <div className='signerLoading'>
            <div className='signerLoadingLoader' />
          </div>
        ) : (
          <></>
        )}
      </div>
    )
  }

  function renderExpanded() {
    const { id, type, tag, index = 0 } = props
    const { accounts, signer } = props
    const { page, addressLimit } = state
    const startIndex = page * addressLimit

    const status = getStatus()

    const hwSigner = isHardwareSigner(type)
    const loading = isLoading(status)

    // TODO: create well-defined signer states that drive these UI features
    const canReconnect =
      hwSigner && (type !== 'trezor' || status === 'disconnected' || status.includes('reconnect'))

    // UI changes for this status only apply to hot signers
    const isLocked = !hwSigner && status === 'locked'
    const permissionId = tag || tag === '' ? 'Newframe' + (tag ? `-${tag}` : '') : undefined

    const zIndex = 1000 - index

    return (
      <div className={'expandedSigner cardShow'} style={{ zIndex }}>
        {<div style={{ height: '22px' }} />}
        {statusText()}
        {type === 'lattice' && status === 'pair' ? (
          <div className='signerLatticePair'>
            <div className='signerLatticePairTitle'>Please input your Lattice&apos;s pairing code</div>
            <div className='signerLatticePairInput'>
              <input
                autoFocus
                tabIndex={1}
                value={state.latticePairCode}
                onChange={(e) => setState({ latticePairCode: (e.target.value || '').toUpperCase() })}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') pairToLattice()
                }}
              />
            </div>
            <div onMouseDown={() => pairToLattice()} className='signerLatticePairSubmit'>
              Pair
            </div>
          </div>
        ) : status === 'ok' || isLocked ? (
          <>
            <div className='signerAddedAccountTitle'>{'available accounts'}</div>
            <div className='signerAccounts'>
              {signer.addresses
                .slice(startIndex, startIndex + addressLimit)
                .map((address: any, index: any) => {
                  const added = accounts[address.toLowerCase()]
                  const checkSummedAddress = getAddress(address)
                  return (
                    <div
                      key={address}
                      className={!added ? 'signerAccount' : 'signerAccount signerAccountAdded'}
                      onClick={() => {
                        if (accounts[address.toLowerCase()]) {
                          void link.executeCommand({ type: 'account.remove', address })
                        } else {
                          void link.executeCommand({
                            type: 'signer.account-add',
                            signerId: signer.id,
                            address
                          })
                        }
                      }}
                    >
                      <div className='signerAccountIndex'>{index + 1 + startIndex}</div>
                      <div className='signerAccountAddress'>
                        {checkSummedAddress.substr(0, 11)} {svg.octicon('kebab-horizontal', { height: 20 })}{' '}
                        {checkSummedAddress.substr(address.length - 10)}
                      </div>
                      <div className='signerAccountCheck' />
                    </div>
                  )
                })}
            </div>
            <div className='signerBottom'>
              <div className='signerBottomPageBack' onMouseDown={() => nextPage(true)}>
                {svg.triangleLeft(20)}
              </div>
              <div className='signerBottomPages'>
                {page + 1 + ' / ' + Math.ceil(signer.addresses.length / addressLimit)}
              </div>
              <div className='signerBottomPageNext' onMouseDown={() => nextPage()}>
                {svg.triangleLeft(20)}
              </div>
            </div>
          </>
        ) : type === 'trezor' && (status === 'need pin' || status === 'enter passphrase') ? (
          <div className='signerInterface'>
            {renderTrezorPin(props.type === 'trezor' && status === 'need pin')}
            {renderTrezorPhrase(props.type === 'trezor' && status === 'enter passphrase')}
          </div>
        ) : loading ? (
          <div className='signerLoading'>
            <div className='signerLoadingLoader' />
          </div>
        ) : (
          <></>
        )}
        <div className='signerControls'>
          {permissionId ? (
            <div className='signerControlDetail'>
              <div className='signerControlDetailKey'>{'PERMISSION ID:'}</div>
              <div className='signerControlDetailValue'>{permissionId}</div>
            </div>
          ) : null}
          {canReconnect && <ReloadSignerButton id={id} />}
          <div
            className='signerControlOption signerControlOptionImportant'
            onClick={() => {
              void link.executeCommand({ type: 'signer.remove', signerId: id })
            }}
          >
            Remove Signer
          </div>
        </div>
      </div>
    )
  }

  const { expanded } = props
  if (expanded) {
    return renderExpanded()
  } else {
    return renderPreview()
  }
}

const EMPTY_ACCOUNTS: Record<string, unknown> = {}

const selectAccounts = (state: DashRendererState) => state.accounts || EMPTY_ACCOUNTS
const selectLiveAccountLimit = (state: DashRendererState) => state.ledger.liveAccountLimit || 5

export default function Signer(props: SignerOwnProps) {
  const selectSigner = useCallback((state: DashRendererState) => state.signers[props.id], [props.id])
  const signer = useWalletSelector(selectSigner)
  const accounts = useWalletSelector(selectAccounts)
  const liveAccountLimit = useWalletSelector(selectLiveAccountLimit)

  if (!signer) return null

  return (
    <SignerView
      {...signer}
      {...props}
      signer={signer}
      accounts={accounts}
      liveAccountLimit={liveAccountLimit}
    />
  )
}
