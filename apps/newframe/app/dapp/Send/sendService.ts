import link from '../../../resources/link'
import { buildSendOrigin, cleanAddress, frameOriginId, type ProviderSendPayload } from './sendTransaction'

export function resolveName(name: string) {
  return new Promise<string>((resolve, reject) => {
    link.rpc('resolveName', name, (err: any, address: string) => {
      if (err || !address) reject(err || new Error('Could not resolve name'))
      else resolve(cleanAddress(address))
    })
  })
}

export function initSendOrigin(chainId: number) {
  link.send('tray:action', 'initOrigin', frameOriginId, buildSendOrigin(chainId))
}

export function providerSend(payload: ProviderSendPayload) {
  return new Promise<any>((resolve) => {
    link.rpc('providerSend', payload, (response: any) => {
      resolve(response)
    })
  })
}

export function closeSend() {
  link.send('frame:close')
}
