const response = await new Promise<unknown>((resolve, reject) => {
  const ws = new WebSocket('ws://localhost:1248')
  const timeout = setTimeout(() => {
    ws.close()
    reject(new Error('Timed out waiting for Newframe WebSocket response'))
  }, 10_000)

  ws.addEventListener('error', reject)
  ws.addEventListener('message', (event) => {
    clearTimeout(timeout)
    ws.close()
    try {
      resolve(JSON.parse(String(event.data)))
    } catch (error) {
      reject(error)
    }
  })
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'eth_accounts', params: [] }))
  })
})

console.log(JSON.stringify(response))
