import React, { useState } from 'react'
import link from '../../../../resources/link'

const nameDefault = 'Token Name'
const symbolDefault = 'SYMBOL'
const chainDefault = 'ID'
const decimalsDefault = '?'
const addressDefault = 'Contract Address'
const logoURIDefault = 'Logo URI'

function AddToken({ token = {} }: any) {
  const chainId = parseInt(token.chainId)
  const decimals = parseInt(token.decimals)
  const [state, setTokenState] = useState({
    name: token.name || nameDefault,
    symbol: (token.symbol || '').toUpperCase() || symbolDefault,
    chainId: (Number.isInteger(chainId) && chainId) || chainDefault,
    address: (token.address || '').toLowerCase() || addressDefault,
    decimals: (Number.isInteger(decimals) && decimals) || decimalsDefault,
    logoURI: token.logoURI || logoURIDefault
  })
  const setState = (update: Partial<typeof state>) => setTokenState((current) => ({ ...current, ...update }))

  const newTokenReady =
    state.name &&
    state.name !== nameDefault &&
    state.symbol &&
    state.symbol !== symbolDefault &&
    Number.isInteger(state.chainId) &&
    state.address &&
    state.address !== addressDefault &&
    Number.isInteger(state.decimals)

  return (
    <div className='notifyBoxWrap' onMouseDown={(e) => e.stopPropagation()}>
      <div className='notifyBoxSlide'>
        <div className='addTokenTitle'>Add New Token</div>
        <div className='addToken'>
          <div className='tokenRow'>
            <div className='tokenName'>
              <div className='tokenInputLabel'>Token Name</div>
              <input
                className={
                  state.name === nameDefault
                    ? 'tokenInput tokenInputLarge tokenInputDim'
                    : 'tokenInput tokenInputLarge'
                }
                value={state.name}
                spellCheck='false'
                onChange={(e) => {
                  setState({ name: e.target.value })
                }}
                onFocus={(e) => {
                  if (e.target.value === nameDefault) setState({ name: '' })
                }}
                onBlur={(e) => {
                  if (e.target.value === '') setState({ name: nameDefault })
                }}
              />
            </div>
          </div>

          <div className='tokenRow'>
            <div className='tokenSymbol'>
              <div className='tokenInputLabel'>Symbol</div>
              <input
                className={state.symbol === symbolDefault ? 'tokenInput tokenInputDim' : 'tokenInput'}
                value={state.symbol}
                spellCheck='false'
                onChange={(e) => {
                  if (e.target.value.length > 10) return e.preventDefault()
                  setState({ symbol: e.target.value })
                }}
                onFocus={(e) => {
                  if (e.target.value === symbolDefault) setState({ symbol: '' })
                }}
                onBlur={(e) => {
                  if (e.target.value === '') setState({ symbol: symbolDefault })
                }}
              />
            </div>

            <div className='tokenDecimals'>
              <div className='tokenInputLabel'>Decimals</div>
              <input
                className={state.decimals === decimalsDefault ? 'tokenInput tokenInputDim' : 'tokenInput'}
                value={state.decimals}
                spellCheck='false'
                onChange={(e) => {
                  if (!e.target.value) return setState({ decimals: '' })
                  if (e.target.value.length > 2) return e.preventDefault()

                  const decimals = parseInt(e.target.value)
                  if (!Number.isInteger(decimals)) return e.preventDefault()

                  setState({ decimals })
                }}
                onFocus={(e) => {
                  if (e.target.value === decimalsDefault) setState({ decimals: '' })
                }}
                onBlur={(e) => {
                  if (e.target.value === '') setState({ decimals: decimalsDefault })
                }}
              />
            </div>

            <div className='tokenChainId'>
              <div className='tokenInputLabel'>Chain ID</div>
              <input
                className={state.chainId === chainDefault ? 'tokenInput tokenInputDim' : 'tokenInput'}
                value={state.chainId}
                spellCheck='false'
                onChange={(e) => {
                  if (!e.target.value) return setState({ chainId: '' })

                  const chainId = parseInt(e.target.value)
                  if (!Number.isInteger(chainId)) return e.preventDefault()

                  setState({ chainId })
                }}
                onFocus={(e) => {
                  if (e.target.value === chainDefault) setState({ chainId: '' })
                }}
                onBlur={(e) => {
                  if (e.target.value === '') setState({ chainId: chainDefault })
                }}
              />
            </div>
          </div>

          <div className='tokenRow'>
            <div className='tokenAddress'>
              <div className='tokenInputLabel'>Contract Address</div>
              <input
                className={
                  state.address === addressDefault
                    ? 'tokenInput tokenInputAddress tokenInputDim'
                    : 'tokenInput tokenInputAddress'
                }
                value={state.address}
                spellCheck='false'
                onChange={(e) => {
                  if (e.target.value.length > 42) return e.preventDefault()
                  setState({ address: e.target.value })
                }}
                onFocus={(e) => {
                  if (e.target.value === addressDefault) setState({ address: '' })
                }}
                onBlur={(e) => {
                  if (e.target.value === '') setState({ address: addressDefault })
                }}
              />
            </div>
          </div>

          <div className='tokenRow'>
            <div className='tokenLogoUri'>
              <div className='tokenInputLabel'>Logo URI</div>
              <input
                className={state.logoURI === logoURIDefault ? 'tokenInput tokenInputDim' : 'tokenInput'}
                value={state.logoURI}
                spellCheck='false'
                onChange={(e) => {
                  setState({ logoURI: e.target.value })
                }}
                onFocus={(e) => {
                  if (e.target.value === logoURIDefault) setState({ logoURI: '' })
                }}
                onBlur={(e) => {
                  if (e.target.value === '') setState({ logoURI: logoURIDefault })
                }}
              />
            </div>
          </div>

          <div className='tokenRow'>
            {newTokenReady ? (
              <div
                className='addTokenSubmit addTokenSubmitEnabled'
                onMouseDown={() => {
                  const { name, symbol, chainId, address, decimals, logoURI } = state
                  const token = { name, symbol, chainId, address, decimals, logoURI } as any
                  void link.executeCommand({
                    type: 'token.add',
                    token,
                    completion: 'dismiss-notification',
                    edit: false
                  })
                }}
              >
                Add Token
              </div>
            ) : (
              <div className='addTokenSubmit'>Fill in Token Details</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AddToken
