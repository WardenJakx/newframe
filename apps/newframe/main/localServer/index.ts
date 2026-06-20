import http from 'http'
import { URL } from 'url'

import imageCache from '../imageCache'

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`)

  if (url.pathname === '/__frame/image-cache') {
    return imageCache.stream(res, url.searchParams)
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not found')
})

server.listen(8421, '127.0.0.1')
