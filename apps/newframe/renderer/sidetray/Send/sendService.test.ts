import { describe, expect, it } from 'bun:test'

import { closeSend, resolveName, submitTransaction } from './sendService'
import { linkMock } from '../../../test/support/rendererClient'

describe('Send name resolution', () => {
  it('uses the typed query client and normalizes the result', async () => {
    linkMock.executeQuery.mockResolvedValueOnce({
      ok: true,
      address: '0x111111111111111111111111111111111111AAAA'
    })

    await expect(resolveName('alice.eth')).resolves.toBe('0x111111111111111111111111111111111111aaaa')
    expect(linkMock.executeQuery).toHaveBeenCalledWith({ type: 'name.resolve', name: 'alice.eth' })
  })

  it('rejects typed lookup failures', async () => {
    linkMock.executeQuery.mockResolvedValueOnce({ ok: false, error: 'not_found' })

    await expect(resolveName('missing.eth')).rejects.toThrow('Could not resolve name')
  })
})

describe('Send commands', () => {
  it('submits only the typed Send capability', async () => {
    linkMock.executeCommand.mockResolvedValueOnce({
      ok: true,
      transactionHash: `0x${'1'.repeat(64)}`
    })

    await expect(
      submitTransaction(
        1,
        {
          to: '0x1111111111111111111111111111111111111111',
          value: '0x1'
        },
        '11111111-1111-4111-8111-111111111111'
      )
    ).resolves.toEqual({ ok: true, transactionHash: `0x${'1'.repeat(64)}` })

    expect(linkMock.executeCommand).toHaveBeenCalledWith({
      type: 'transaction.submit',
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      chainId: 1,
      transaction: {
        to: '0x1111111111111111111111111111111111111111',
        value: '0x1'
      }
    })
  })

  it('closes only its own side tray', () => {
    closeSend()
    expect(linkMock.executeCommand).toHaveBeenCalledWith({ type: 'sidetray.close' })
  })
})
