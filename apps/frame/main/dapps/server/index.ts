import http from 'http'
import { parse } from 'cookie'
import { URL } from 'url'
import { namehash } from 'ethers'

import store from '../../store'

import sessions from './sessions'
import asset from './asset'

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`)
  const ens = url.hostname.replace('.localhost', '')
  const session = (req.headers.cookie && parse(req.headers.cookie).__frameSession) || ''

  // namehash throws on names that fail ENS normalization
  let dappId = ''
  try {
    dappId = namehash(ens)
  } catch (e) {
    res.writeHead(404)
    return res.end('Invalid ENS name')
  }

  // check if dapp is added before progressing
  if (!store('main.dapps', dappId)) {
    res.writeHead(404)
    return res.end('Dapp not installed')
  }

  if (sessions.verify(ens, session)) {
    return asset.stream(res, dappId, url.pathname)
  } else {
    res.writeHead(403)
    return res.end('No dapp session, launch this dapp from Frame')
  }
})

server.listen(8421, '127.0.0.1')

export default { sessions }
