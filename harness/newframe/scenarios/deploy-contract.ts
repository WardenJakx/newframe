import { BrowserProvider } from 'ethers'

import { HarnessExtension } from '../core/extension.ts'

const NEWFRAME_URL = 'http://127.0.0.1:1248'

let extension: HarnessExtension
let provider: BrowserProvider

async function main() {
  extension = await HarnessExtension.connect(NEWFRAME_URL)
  try {
    provider = new BrowserProvider(extension.eip1193('https://frame.test'))
    await provider.send('eth_accounts', [])

    const signer: Awaited<ReturnType<BrowserProvider['listAccounts']>>[number] | undefined = (
      await provider.listAccounts()
    ).at(0)
    if (!signer) {
      throw new Error('No account available')
    }

    const tx = await signer.sendTransaction({
      data: '0x6080604052348015600f57600080fd5b50603580601d6000396000f3006080604052600080fd00a165627a7a72305820f50314badc96cf2df848b358f976e52facd1986d2f3eb5bd7b41071ac667ae480029',
      gasLimit: 0x10cba
    })
    if (!/^0x[0-9a-fA-F]{64}$/.test(tx.hash)) {
      throw new Error(`Invalid transaction hash: ${tx.hash}`)
    }
    console.log(JSON.stringify({ transactionHash: tx.hash }))
  } finally {
    extension.close()
  }
}

await main()
