import React from 'react'
import Restore from 'react-restore'
import svg from '../../../resources/svg'
import link from '../../../resources/link'

import { toBigInt } from '../../../resources/utils/numbers'
import { usesBaseFee } from '../../../resources/domain/transaction'

import Confirm from '../../../resources/Components/Confirm'
import AddToken from './AddToken'
import appIcon from '../../../../../assets/brand/newframe/app-icon.png'

const FEE_WARNING_THRESHOLD_USD = 50
const capitalize = (s: any) => s[0].toUpperCase() + s.slice(1)

class Notify extends React.Component<any, any> {
  declare store: Store

  betaDisclosure() {
    return (
      <div className='notifyBoxWrap' onMouseDown={(e) => e.stopPropagation()}>
        <div className='notifyBoxSlide'>
          <div className='notifyBox'>
            <div className='notifyAppIcon'>
              <img src={appIcon} />
            </div>
            <div className='notifyTitle'>Newframe v0.5-beta</div>
            <div className='notifyBody'>
              <div className='notifyBodyBlock notifyBodyBlockBig'>
                We are excited to welcome you to the next iteration of Newframe!
              </div>
              <div className='notifyBodyBlock'>
                Be advised, this version of Newframe is currently in &quot;beta&quot; and will update on a
                beta track
              </div>
              <div className='notifyBodyBlock'>
                Use hardware signers for high value accounts and verify all transaction and account details on
                your signing device
              </div>
              <div className='notifyBodyBlock'>
                <span>Read</span>
                <span
                  className='notifyBodyLink'
                  onMouseDown={() => {
                    link.send(
                      'tray:openExternal',
                      'https://github.com/wardenjakx/newframe/blob/main/apps/newframe/LICENSE'
                    )
                  }}
                >
                  our license
                </span>
                <span>and use Newframe at your own risk</span>
              </div>
              {/*
              <div className='notifyBodyBlock notifyBodyBlockBig'>
                <div>Please give us your feedback!</div>
                <div
                  className='notifyBodyLink'
                  style={{ marginTop: '20px' }}
                  onMouseDown={() => {
                    link.send('tray:openExternal', 'https://feedback.newframe.sh')
                  }}
                >
                  feedback.newframe.sh
                </div>
              </div>
              */}
            </div>
            <div className='notifyInput'>
              <div
                className='notifyInputOption notifyInputSingleButton'
                onMouseDown={() => {
                  link.send('tray:action', 'muteBetaDisclosure')
                  link.send('tray:action', 'backDash')
                }}
              >
                <div className='notifyInputOptionText notifyBetaGo'>Let&apos;s go!</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  gasFeeWarning({ req = {}, feeUSD = '0.00', currentSymbol = 'ETH' }: any) {
    return (
      <div className='notifyBoxWrap' onMouseDown={(e) => e.stopPropagation()}>
        <div className='notifyBox'>
          <div className='notifyTitle'>Gas Fee Warning</div>
          <div className='notifyBody'>
            {feeUSD !== '0.00' ? (
              <>
                <div className='notifyBodyLine'>The max fee for this transaction is:</div>
                <div className='notifyBodyLine notifyBodyPrice'>{`≈ $${feeUSD} in ${currentSymbol}`}</div>
              </>
            ) : (
              <div className='notifyBodyLine'>
                We were unable to determine this transaction&apos;s fee in USD.
              </div>
            )}
            <div className='notifyBodyQuestion'>Are you sure you want to proceed?</div>
          </div>
          <div className='notifyInput'>
            <div
              className='notifyInputOption notifyInputDeny'
              onMouseDown={() => {
                link.send('tray:action', 'backDash')
              }}
            >
              <div className='notifyInputOptionText'>Cancel</div>
            </div>
            <div
              className='notifyInputOption notifyInputProceed'
              onMouseDown={() => {
                link.rpc('approveRequest', req, () => {})
                link.send('tray:action', 'backDash')
              }}
            >
              <div className='notifyInputOptionText'>Proceed</div>
            </div>
          </div>
          <div className='notifyCheck' onMouseDown={() => link.send('tray:action', 'toggleGasFeeWarning')}>
            <div className='notifyCheckBox'>
              {this.store('main.mute.gasFeeWarning') ? svg.octicon('check', { height: 26 }) : null}
            </div>
            <div className='notifyCheckText'>{"Don't show this warning again"}</div>
          </div>
        </div>
      </div>
    )
  }

  signerUnavailableWarning() {
    return (
      <div className='notifyBoxWrap' onMouseDown={(e) => e.stopPropagation()}>
        <div className='notifyBox'>
          <div className='notifyTitle'>Signer unavailable for signing!</div>
          <div className='notifyBody'>
            <div className='notifyBodyQuestion'>Please check the signer for this account and try again</div>
          </div>
          <div className='notifyInput'>
            <div
              className='notifyInputOption notifyInputSingleButton'
              onMouseDown={() => {
                link.send('tray:action', 'backDash')
              }}
            >
              <div className='notifyInputOptionText'>OK</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  noSignerWarning() {
    return (
      <div className='notifyBoxWrap' onMouseDown={(e) => e.stopPropagation()}>
        <div className='notifyBox'>
          <div className='notifyTitle'>No Signer Attached!</div>
          <div className='notifyBody'>
            <div className='notifyBodyLine'>No signer attached for this account</div>
            <div className='notifyBodyQuestion'>Please attach a signer that can sign for this account</div>
          </div>
          <div className='notifyInput'>
            <div
              className='notifyInputOption notifyInputSingleButton'
              onMouseDown={() => {
                link.send('tray:action', 'backDash')
              }}
            >
              <div className='notifyInputOptionText'>OK</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  toDisplayUSD(usd: any) {
    // round up to 2 decimal places
    return (Math.ceil(usd * 100) / 100).toFixed(2)
  }

  signerCompatibilityWarning({ req = {}, compatibility = {}, chain = {} }: any) {
    const { signer, tx } = compatibility
    return (
      <div className='notifyBoxWrap' onMouseDown={(e) => e.stopPropagation()}>
        <div className='notifyBox'>
          <div className='notifyTitle'>Signer Compatibility</div>
          <div className='notifyBody'>
            <div className='notifyBodyLine'>
              {`Your ${capitalize(signer)} is not compatible with ${capitalize(tx)} ${
                tx === 'london' ? '(EIP-1559) ' : ''
              }transactions. Your transaction will be converted to a legacy transaction before signing.`}
            </div>
            {['lattice', 'ledger'].includes(signer) ? (
              <div className='notifyBodyUpdate'>
                {`Update your ${capitalize(signer)} to enable compatibility`}
              </div>
            ) : null}
            <div className='notifyBodyQuestion'>Do you want to proceed?</div>
          </div>
          <div className='notifyInput'>
            <div
              className='notifyInputOption notifyInputDeny'
              onMouseDown={() => {
                link.send('tray:action', 'backDash')
              }}
            >
              <div className='notifyInputOptionText'>Cancel</div>
            </div>
            <div
              className='notifyInputOption notifyInputProceed'
              onMouseDown={() => {
                // TODO: Transacionns need a better flow to respond to mutiple notifications after hitting sign
                const isTestnet = this.store('main.networks', chain.type, chain.id, 'isTestnet')
                const {
                  nativeCurrency,
                  nativeCurrency: { symbol: currentSymbol = '?' }
                } = this.store('main.networksMeta', chain.type, chain.id)
                const nativeUSD =
                  nativeCurrency && nativeCurrency.usd && !isTestnet ? nativeCurrency.usd.price : undefined
                const hasNativeUSD = typeof nativeUSD === 'number'

                const gasLimit = toBigInt(req.data.gasLimit) ?? 0n
                const maxFeePerGas =
                  toBigInt(usesBaseFee(req.data) ? req.data.maxFeePerGas : req.data.gasPrice) ?? 0n
                const maxFee = maxFeePerGas * gasLimit
                const maxFeeUSD = hasNativeUSD ? (Number(maxFee) / 1e18) * nativeUSD : 0

                if (
                  hasNativeUSD &&
                  (maxFeeUSD > FEE_WARNING_THRESHOLD_USD || this.toDisplayUSD(maxFeeUSD) === '0.00') &&
                  !this.store('main.mute.gasFeeWarning')
                ) {
                  link.send('tray:action', 'navDash', {
                    view: 'notify',
                    data: {
                      notify: 'gasFeeWarning',
                      notifyData: { req, feeUSD: this.toDisplayUSD(maxFeeUSD), currentSymbol }
                    }
                  })
                } else {
                  link.rpc('approveRequest', req, () => {})
                  link.send('tray:action', 'backDash')
                }
              }}
            >
              <div className='notifyInputOptionText'>Proceed</div>
            </div>
          </div>
          <div
            className='notifyCheck'
            onMouseDown={() => link.send('tray:action', 'toggleSignerCompatibilityWarning')}
          >
            <div className='notifyCheckBox'>
              {this.store('main.mute.signerCompatibilityWarning')
                ? svg.octicon('check', { height: 26 })
                : null}
            </div>
            <div className='notifyCheckText'>{"Don't show this warning again"}</div>
          </div>
        </div>
      </div>
    )
  }

  contractData() {
    return (
      <div
        className='notifyBoxWrap'
        onMouseDown={(e) => e.stopPropagation()}
        style={
          this.store('view.notify') === 'contractData' ? { transform: 'translateX(calc(-100% - 100px))' } : {}
        }
      >
        <div className='notifyBox'>
          <div className='notifyTitle'>
            <div>Contract Data</div>
            <div>Not Allowed</div>
          </div>
          <div className='notifyBody'>
            <div className='notifyBodyLine'>
              Your Ledger currently doesn&apos;t allow signing of contract data.
            </div>
            <div className='notifyBodyLine'>
              <span>To change this settings go to</span>
              <br />
              <span style={{ fontWeight: 'bold' }}>{'Settings > Contract Data'}</span>
              <br />
              <span>on your Ledger and select</span>
              <br />
              <span style={{ fontWeight: 'bold' }}>Yes</span>
            </div>
          </div>
          <div className='notifyInput'>
            <div
              className='notifyInputOption notifyInputSingleButton'
              onMouseDown={() => {
                link.send('tray:action', 'backDash')
              }}
            >
              <div className='notifyInputOptionText'>OK</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  hotAccountWarning() {
    return (
      <div
        className='notifyBoxWrap'
        onMouseDown={(e) => e.stopPropagation()}
        style={
          this.store('view.notify') === 'hotAccountWarning'
            ? { transform: 'translateX(calc(-100% - 100px))' }
            : {}
        }
      >
        <div className='notifyBox'>
          <div className='notifyTitle'>
            <div>Hot Signer Alpha</div>
          </div>
          <div className='notifyBody'>
            <div className='notifyBodyLine'>
              Newframe hot signers are in alpha! Do not use them with high value accounts and verify your
              backups are valid. Only proceed if you understand and accept these risks.
            </div>
          </div>
          <div className='notifyInput'>
            <div
              className='notifyInputOption notifyInputSingleButton'
              onMouseDown={() => {
                link.send('tray:action', 'backDash')
              }}
            >
              <div className='notifyInputOptionText'>OK</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  openExternal({ url }: any) {
    return (
      <div className='notifyBoxWrap' onMouseDown={(e) => e.stopPropagation()}>
        <div className='notifyBox'>
          <div className='notifyTitle'>Open External Link</div>
          <div className='notifyBody'>
            <div className='notifyBodyLineUrl'>{url}</div>
            <div className='notifyBodyLine'>{'Open Link in Browser?'}</div>
          </div>
          <div className='notifyInput'>
            <div
              className='notifyInputOption notifyInputDeny'
              onMouseDown={() => {
                link.send('tray:action', 'backDash')
              }}
            >
              <div className='notifyInputOptionText'>Cancel</div>
            </div>
            <div
              className='notifyInputOption notifyInputProceed'
              onMouseDown={() => {
                link.send('tray:openExternal', url)
                link.send('tray:action', 'backDash')
              }}
            >
              <div className='notifyInputOptionText'>Proceed</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  openExplorer({ hash, chain }: any) {
    return (
      <div className='notifyBoxWrap' onMouseDown={(e) => e.stopPropagation()}>
        <div className='notifyBox'>
          <div className='notifyTitle'>Open Block Explorer</div>
          <div className='notifyBody'>
            <div className='notifyBodyLine'>
              Newframe will open a block explorer in your browser for transaction:
            </div>
            <div className='notifyBodyHash'>{hash}</div>
          </div>
          <div className='notifyInput'>
            <div
              className='notifyInputOption notifyInputDeny'
              onMouseDown={() => {
                link.send('tray:action', 'backDash')
              }}
            >
              <div className='notifyInputOptionText'>Cancel</div>
            </div>
            <div
              className='notifyInputOption notifyInputProceed'
              onMouseDown={() => {
                link.send('tray:openExplorer', chain, hash)
                link.send('tray:action', 'backDash')
              }}
            >
              <div className='notifyInputOptionText'>Proceed</div>
            </div>
          </div>
          <div
            className='notifyCheck'
            onMouseDown={() => {
              link.send('tray:action', 'toggleExplorerWarning')
            }}
          >
            <div className='notifyCheckBox'>
              {this.store('main.mute.explorerWarning') ? svg.octicon('check', { height: 26 }) : null}
            </div>
            <div className='notifyCheckText'>{"Don't show this warning again"}</div>
          </div>
        </div>
      </div>
    )
  }

  override render() {
    const { notify, notifyData } = this.props.data
    if (notify === 'mainnet') {
      return (
        <div className='notify cardShow' onMouseDown={() => link.send('tray:action', 'backDash')}>
          {(this as any).mainnet()}
        </div>
      )
    } else if (notify === 'betaDisclosure') {
      return <div className='notify cardShow'>{this.betaDisclosure()}</div>
    } else if (notify === 'gasFeeWarning') {
      return <div className='notify cardShow'>{this.gasFeeWarning(notifyData)}</div>
    } else if (notify === 'noSignerWarning') {
      return <div className='notify cardShow'>{(this.noSignerWarning as any)(notifyData)}</div>
    } else if (notify === 'signerUnavailableWarning') {
      return <div className='notify cardShow'>{(this.signerUnavailableWarning as any)(notifyData)}</div>
    } else if (notify === 'signerCompatibilityWarning') {
      return <div className='notify cardShow'>{this.signerCompatibilityWarning(notifyData)}</div>
    } else if (notify === 'contractData') {
      return <div className='notify cardShow'>{this.contractData()}</div>
    } else if (notify === 'hotAccountWarning') {
      return <div className='notify cardShow'>{this.hotAccountWarning()}</div>
    } else if (notify === 'confirmRemoveChain') {
      const { chain } = notifyData

      const onAccept = () => {
        link.send('tray:action', 'removeNetwork', chain)

        // if accepted, go back twice to get back to the main chains panel
        link.send('tray:action', 'backDash', 2)
      }

      const onDecline = () => {
        link.send('tray:action', 'backDash')
      }

      return (
        <div className='notify cardShow'>
          <div className='notifyBoxWrap' onMouseDown={(e) => e.stopPropagation()}>
            <div className='notifyBoxSlide'>
              <Confirm
                prompt='Are you sure you want to remove this chain?'
                onAccept={onAccept}
                onDecline={onDecline}
              />
            </div>
          </div>
        </div>
      )
    } else if (notify === 'openExternal') {
      return <div className='notify cardShow'>{this.openExternal(notifyData)}</div>
    } else if (notify === 'openExplorer') {
      return <div className='notify cardShow'>{this.openExplorer(notifyData)}</div>
    } else if (notify === 'addToken') {
      return (
        <div className='notify cardShow'>
          <div className='notifyBoxWrap' onMouseDown={(e) => e.stopPropagation()}>
            <div className='notifyBoxSlide'>
              <AddToken {...notifyData} />
            </div>
          </div>
        </div>
      )
    } else {
      return null
    }
  }
}

export default Restore.connect(Notify)
