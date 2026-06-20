import { Interface } from 'ethers'
import erc20Abi from '../../main/externalData/balances/erc-20-abi'

export const erc20Interface = new Interface(erc20Abi)
