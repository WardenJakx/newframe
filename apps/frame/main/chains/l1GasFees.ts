import { Interface, Transaction } from 'ethers'

// the OP-stack GasPriceOracle predeploy, present at the same address on all optimism-family chains
const GAS_PRICE_ORACLE_ADDRESS = '0x420000000000000000000000000000000000000F'

const oracleInterface = new Interface(['function getL1Fee(bytes _data) view returns (uint256)'])

interface L1TxParams {
  to?: string
  value?: string | number
  data?: string
  gasLimit?: string | number
  chainId?: string | number
  nonce?: string | number
}

interface Eip1193Provider {
  request(payload: { method: string; params?: unknown[]; chainId?: string }): Promise<unknown>
}

// estimates the L1 data fee portion of a transaction on an OP-stack chain by
// calling the GasPriceOracle predeploy directly with the serialized transaction
export async function estimateL1GasCost(provider: Eip1193Provider, txData: L1TxParams): Promise<bigint> {
  const { to, value, data, gasLimit, chainId, nonce } = txData

  const tx = Transaction.from({
    to,
    data,
    type: 2,
    chainId: typeof chainId === 'string' ? parseInt(chainId) : chainId,
    value: value || 0,
    gasLimit: gasLimit || 0,
    nonce: typeof nonce === 'string' ? parseInt(nonce) : nonce || 0
  })

  const calldata = oracleInterface.encodeFunctionData('getL1Fee', [tx.unsignedSerialized])

  const result = await provider.request({
    method: 'eth_call',
    params: [{ to: GAS_PRICE_ORACLE_ADDRESS, data: calldata }, 'latest']
  })

  return BigInt(result as string)
}
