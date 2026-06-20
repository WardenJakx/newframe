import path from 'path'
import { rm } from 'fs/promises'
import { electronMock } from '../../bun.mocks'

const PASSWORD = 'fr@///3_password'
const NEW_PASSWORD = 'an0ther-g00d-p@ssword'
const VAULT_PATH = path.resolve(__dirname, '../.userData/vault.json')

const clean = () => rm(VAULT_PATH, { recursive: true, force: true })

let vault: any

describe('Vault', () => {
  beforeAll(async () => {
    electronMock.app.getPath.mockReturnValue(path.resolve(__dirname, '../.userData'))
    await clean()
    vault = (await import('../../../main/vault')).default
  })

  afterAll(async () => {
    await clean()
  })

  test('No vault exists initially', () => {
    expect(vault.exists()).toBe(false)
    expect(vault.isUnlocked()).toBe(false)
  })

  test('Create rejects a weak password', () => {
    expect(() => vault.create('weak')).toThrow()
    expect(vault.exists()).toBe(false)
  })

  test('Create', () => {
    const key = vault.create(PASSWORD)
    expect(key).toHaveLength(64)
    expect(vault.exists()).toBe(true)
    expect(vault.isUnlocked()).toBe(true)
    expect(vault.getKey()).toBe(key)
  })

  test('Create fails when vault already exists', () => {
    expect(() => vault.create(PASSWORD)).toThrow('Vault already exists')
  })

  test('Lock', () => {
    vault.lock()
    expect(vault.isUnlocked()).toBe(false)
    expect(vault.getKey()).toBe(null)
  })

  test('Unlock with wrong password', () => {
    expect(() => vault.unlock('wrong password')).toThrow('Incorrect password')
    expect(vault.isUnlocked()).toBe(false)
  })

  test('Unlock', () => {
    const key = vault.unlock(PASSWORD)
    expect(key).toHaveLength(64)
    expect(vault.isUnlocked()).toBe(true)
  })

  test('Unlock returns the same key created', () => {
    const key = vault.getKey()
    vault.lock()
    expect(vault.unlock(PASSWORD)).toBe(key)
  })

  test('Unlock with vault key', () => {
    const key = vault.getKey()
    vault.lock()
    expect(vault.unlockWithKey(key)).toBe(key)
  })

  test('Acquire key uses the session when unlocked', () => {
    expect(vault.acquireKey('any password, ignored')).toBe(vault.getKey())
  })

  test('Change password keeps the same vault key', () => {
    const key = vault.getKey()
    vault.changePassword(PASSWORD, NEW_PASSWORD)
    vault.lock()
    expect(() => vault.unlock(PASSWORD)).toThrow('Incorrect password')
    expect(vault.unlock(NEW_PASSWORD)).toBe(key)
  })

  test('Change password rejects a weak new password', () => {
    expect(() => vault.changePassword(NEW_PASSWORD, 'weak')).toThrow()
  })
})
