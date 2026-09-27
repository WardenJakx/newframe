type SecretAccount = { address: string; created: string; signer: string; profileId: string }
interface SecretExportPorts {
  snapshot(): {
    currentProfile: string
    appLock: { locked: boolean }
    accounts: Record<string, SecretAccount | undefined>
  }
  exportSecret(address: string): Promise<{ type: string; value: string }>
}

export async function exportProtectedPrivateKey(accountId: string, ports: SecretExportPorts) {
  const before = ports.snapshot()
  const account = before.accounts[accountId]
  if (!account) {
    return undefined
  }
  if (before.appLock.locked || account.profileId !== before.currentProfile) {
    throw new Error('Unlock the active profile before exporting a private key.')
  }
  const identity = {
    address: account.address,
    created: account.created,
    signer: account.signer,
    profile: account.profileId
  }
  const secret = await ports.exportSecret(identity.address)
  const after = ports.snapshot()
  const current = after.accounts[accountId]
  if (
    after.appLock.locked ||
    after.currentProfile !== identity.profile ||
    !current ||
    current.created !== identity.created ||
    current.signer !== identity.signer ||
    current.address !== identity.address ||
    current.profileId !== identity.profile
  ) {
    throw new Error('Account authority changed during private key export.')
  }
  if (secret.type !== 'privateKey') {
    throw new Error('Private key was not returned')
  }
  return secret.value
}
