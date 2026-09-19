const APPEAR_AS_MM = '__newframeAppearAsMM__'
const LEGACY_APPEAR_AS_MM = '__frameAppearAsMM__'

export function isSupportedTab(tab?: chrome.tabs.Tab) {
  return tab?.id !== undefined && /^(https?|file):\/\//.test(tab.url ?? '')
}

export async function getMetaMaskSetting(tabId: number): Promise<boolean> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (key: string, legacyKey: string) =>
        (localStorage.getItem(key) ?? localStorage.getItem(legacyKey)) === 'true',
      args: [APPEAR_AS_MM, LEGACY_APPEAR_AS_MM]
    })
    return results[0]?.result === true
  } catch {
    // Browser-owned pages can prohibit injection even when their URL is HTTPS.
    return false
  }
}

export async function toggleMetaMaskSetting(tabId: number) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (key: string, legacyKey: string) => {
      const enabled = (localStorage.getItem(key) ?? localStorage.getItem(legacyKey)) === 'true'
      localStorage.setItem(key, String(!enabled))
      window.location.reload()
    },
    args: [APPEAR_AS_MM, LEGACY_APPEAR_AS_MM]
  })
  window.close()
}

export async function refreshCurrentChain(tabId: number) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'embedded:action',
      action: { type: 'getChainId' }
    })
  } catch {
    // The content script may be unavailable while the tab reloads.
  }
}

export function normalizeChainId(chainId: number | string) {
  const input = String(chainId).trim()
  if (!/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(input)) {
    return
  }
  const value = BigInt(input)
  if (value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    return
  }
  return `0x${value.toString(16)}`
}

export async function switchOriginChain(tab: chrome.tabs.Tab, chainId: number | string) {
  const normalizedChainId = normalizeChainId(chainId)
  if (!normalizedChainId) {
    throw new Error('Invalid chain ID')
  }

  await chrome.runtime.sendMessage({
    tab,
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: normalizedChainId }]
  })
}
