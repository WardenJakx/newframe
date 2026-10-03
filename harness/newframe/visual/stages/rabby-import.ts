import { isDeepStrictEqual } from 'node:util'

import type { Locator } from 'playwright-core'

import type { RabbyEmulatorAccount } from '../../services/rabby-emulator.ts'
import type { AppState, VisualHarnessContext, VisualStage } from '../types.ts'

function accountIdentity(state: AppState, address: string) {
  const account = state.main?.accounts?.[address]
  return (
    account && {
      name: account.name,
      profileId: account.profileId,
      signer: account.signer,
      lastSignerType: account.lastSignerType
    }
  )
}

async function receiveSnapshot(context: VisualHarnessContext, accounts: Locator, screenshots: boolean) {
  const { runtime, tray } = context
  await accounts.getByRole('button', { name: 'Add account', exact: true }).click()
  await accounts.getByRole('button', { name: 'Import from Rabby', exact: true }).click()
  if (screenshots) {
    await runtime.screenshot(tray, '07a-rabby-import-intro.png')
  }
  await accounts.getByRole('button', { name: 'Scan QR', exact: true }).click()
  await accounts.getByLabel('QR camera preview').waitFor()
  if (screenshots) {
    await runtime.screenshot(tray, '07b-rabby-import-scanner.png')
    await accounts.getByText(/^Reading QR (?:[1-9]|[1-9][0-9])%$/).waitFor({ timeout: 20_000 })
    await runtime.screenshot(tray, '07c-rabby-import-qr-progress.png')
  }
  await accounts.getByLabel('Rabby password', { exact: true }).waitFor({ timeout: 45_000 })
  if (screenshots) {
    await runtime.screenshot(tray, '07d-rabby-import-password.png')
  }
}

function verifyImportedAccount(
  context: VisualHarnessContext,
  state: AppState,
  fixture: RabbyEmulatorAccount,
  profileId: string
) {
  const { runtime, safeSeed } = context
  const account =
    state.main?.accounts?.[fixture.address] ?? runtime.fail(`Rabby account is missing: ${fixture.name}`)
  if (account.name !== fixture.name || account.profileId !== profileId) {
    runtime.fail(`Rabby account identity/profile differs for ${fixture.name}`)
  }
  if (fixture.kind === 'mnemonic' || fixture.kind === 'private-key') {
    if (!account.signer || !state.main?.signers?.[account.signer]) {
      runtime.fail(`Rabby signing account has no stored signer: ${fixture.name}`)
    }
  } else if (account.signer) {
    runtime.fail(`Rabby public-only account acquired a signer: ${fixture.name}`)
  }
  if (fixture.kind === 'hardware' && account.lastSignerType !== 'Address') {
    runtime.fail(`Rabby hardware account was not imported watch-only: ${fixture.name}`)
  }
  if (fixture.kind === 'safe') {
    const deployment = account.safe?.[String(safeSeed.chainId)]
    if (
      !deployment ||
      deployment.configuration.threshold !== safeSeed.threshold ||
      deployment.configuration.owners.join().toLowerCase() !== safeSeed.owners.join().toLowerCase()
    ) {
      runtime.fail('Rabby Safe import differs from the deployed Safe configuration')
    }
  }
  if (fixture.derivationPath && account.rabbySource?.derivationPath !== fixture.derivationPath) {
    runtime.fail(`Rabby account derivation was not retained: ${fixture.name}`)
  }
}

export const rabbyImportStage: VisualStage = {
  name: 'import Rabby animated QR snapshot',
  async run(context) {
    const { driver, rabby, runtime, tray } = context
    const original = await driver.getAppState()
    const originalProfile = original.main?.currentProfile
    const selected = original.main?.accounts?.[original.main.currentAccount ?? '']
    const existing = rabby.accounts.filter((account) => Boolean(original.main?.accounts?.[account.address]))
    const fresh = rabby.accounts.filter((account) => !original.main?.accounts?.[account.address])
    const profileCount = Object.keys(original.main?.profiles ?? {}).length
    const accountCount = Object.keys(original.main?.accounts ?? {}).length
    const accounts = tray.getByRole('dialog', { name: 'Accounts' })
    let importedProfile: string | undefined

    try {
      await driver.clearPanelAndOverlays()
      await tray.getByRole('button', { name: 'Accounts', exact: true }).click()
      await runtime.screenshot(tray, '07-rabby-import-entry.png')
      await receiveSnapshot(context, accounts, true)

      const password = accounts.getByLabel('Rabby password', { exact: true })
      await password.fill('wrong harness password')
      await accounts.getByRole('button', { name: 'Review accounts', exact: true }).click()
      await accounts
        .getByText(/incorrect.*password|password.*incorrect|check your Rabby password/i)
        .waitFor({ timeout: 15_000 })
      await runtime.screenshot(tray, '07e-rabby-import-wrong-password.png')
      if (Object.keys((await driver.getAppState()).main?.accounts ?? {}).length !== accountCount) {
        runtime.fail('An incorrect Rabby password changed accounts')
      }
      await password.fill(rabby.password)
      await accounts.getByRole('button', { name: 'Review accounts', exact: true }).click()
      const importLabel = `Import ${fresh.length} account${fresh.length === 1 ? '' : 's'}`
      await accounts.getByRole('button', { name: importLabel, exact: true }).waitFor({ timeout: 20_000 })
      await accounts.getByText('Already in Newframe · Skipped', { exact: true }).first().waitFor()
      await runtime.screenshot(tray, '07f-rabby-import-review.png')
      await accounts.getByText('Existing harness account', { exact: true }).scrollIntoViewIfNeeded()
      await runtime.screenshot(tray, '07g-rabby-import-duplicate-skipped.png')
      await accounts.getByText('Rabby Keystone', { exact: true }).scrollIntoViewIfNeeded()
      await runtime.screenshot(tray, '07h-rabby-import-public-accounts.png')
      await accounts.getByRole('button', { name: importLabel, exact: true }).click()
      const terminal = await driver.waitForState(
        (state) =>
          Object.values(state.operations ?? {}).some(
            ({ operation }) => operation?.type === 'rabby.import' && operation.status !== 'pending'
          ),
        30_000,
        'Rabby import did not finish'
      )
      const outcome = Object.values(terminal.operations ?? {}).find(
        ({ operation }) => operation?.type === 'rabby.import'
      )?.operation
      if (outcome?.status === 'failed') {
        await runtime.screenshot(tray, '07z-rabby-import-error.png')
        runtime.fail(
          `Rabby import failed: ${outcome.error?.code ?? 'unknown'}: ${outcome.error?.message ?? ''}`
        )
      }
      await accounts
        .getByRole('button', { name: 'View imported accounts', exact: true })
        .waitFor({ timeout: 30_000 })
      await runtime.screenshot(tray, '07i-rabby-import-complete.png')

      const imported = await driver.waitForState(
        (state) => fresh.every(({ address }) => Boolean(state.main?.accounts?.[address])),
        15_000,
        'Rabby snapshot did not commit all new accounts'
      )
      const profileId =
        imported.main?.accounts?.[fresh[0].address]?.profileId ??
        runtime.fail('Rabby import did not assign a profile')
      importedProfile = profileId
      if (
        imported.main?.profiles?.[importedProfile]?.name !== 'Rabby Wallet Import' ||
        Object.keys(imported.main.profiles ?? {}).length !== profileCount + 1 ||
        Object.keys(imported.main.accounts ?? {}).length !== accountCount + fresh.length
      ) {
        runtime.fail('Rabby import did not create exactly one profile containing all new accounts')
      }
      for (const fixture of fresh) {
        verifyImportedAccount(context, imported, fixture, profileId)
      }
      for (const fixture of existing) {
        if (
          !isDeepStrictEqual(
            accountIdentity(original, fixture.address),
            accountIdentity(imported, fixture.address)
          )
        ) {
          runtime.fail(`Rabby import changed an existing account: ${fixture.address}`)
        }
      }

      await accounts.getByRole('button', { name: 'View imported accounts', exact: true }).click()
      await accounts.getByRole('button', { name: 'Select active profile', exact: true }).waitFor()
      await runtime.screenshot(tray, '07j-rabby-import-profile.png')
      await accounts.getByText('Rabby Team Safe', { exact: true }).scrollIntoViewIfNeeded()
      await runtime.screenshot(tray, '07k-rabby-import-safe-account.png')
      await accounts.getByText('Rabby Keystone', { exact: true }).scrollIntoViewIfNeeded()
      await runtime.screenshot(tray, '07l-rabby-import-hardware-accounts.png')

      await receiveSnapshot(context, accounts, false)
      await accounts.getByLabel('Rabby password', { exact: true }).fill(rabby.password)
      await accounts.getByRole('button', { name: 'Review accounts', exact: true }).click()
      await accounts.getByRole('button', { name: 'Done', exact: true }).waitFor({ timeout: 20_000 })
      await runtime.screenshot(tray, '07m-rabby-import-repeat-skipped.png')
      const repeated = await driver.getAppState()
      if (
        Object.keys(repeated.main?.accounts ?? {}).length !== accountCount + fresh.length ||
        Object.keys(repeated.main?.profiles ?? {}).length !== profileCount + 1 ||
        Object.keys(repeated.main?.signers ?? {}).length !== Object.keys(imported.main?.signers ?? {}).length
      ) {
        runtime.fail('Repeated Rabby import created accounts, profiles, or signers')
      }
      await accounts.getByRole('button', { name: 'Done', exact: true }).click()
      runtime.evidence('rabbyQrFragments', rabby.fragmentCount)
      runtime.evidence('rabbyImportedAccounts', fresh.length)
      runtime.evidence('rabbySkippedExistingAccounts', existing.length)
      runtime.evidence('rabbyHardwareWatchAccounts', fresh.filter(({ kind }) => kind === 'hardware').length)
      runtime.evidence('rabbyRepeatImportNoChanges', true)
      runtime.evidence('rabbyProfileName', 'Rabby Wallet Import')
    } finally {
      const closeAccounts = accounts.getByRole('button', { name: 'Close accounts', exact: true })
      if (await closeAccounts.isVisible()) {
        await closeAccounts.click()
        await accounts.waitFor({ state: 'hidden' })
      }
      await driver.clearPanelAndOverlays()
      // The following Safe stage imports this local contract into the original profile.
      if (importedProfile && fresh.some(({ kind }) => kind === 'safe')) {
        const safeId = context.safeSeed.safe.toLowerCase()
        // Removing an account keeps its saved name. Restore this test contract's
        // name before removal so the next stage does not inherit the Rabby alias.
        await driver.executeCommand(tray, {
          type: 'account.update',
          accountId: safeId,
          name: original.main?.accounts?.[safeId]?.name ?? 'Safe Account'
        })
        await driver.executeCommand(tray, {
          type: 'account.remove',
          address: safeId
        })
      }
      if (originalProfile) {
        await driver.executeCommand(tray, {
          type: 'profile.select',
          operationId: crypto.randomUUID(),
          profileId: originalProfile
        })
      }
      if (selected) {
        await driver.setSelectedAccount(selected)
      }
      await tray.getByRole('button', { name: 'Accounts', exact: true }).waitFor()
    }
  }
}
