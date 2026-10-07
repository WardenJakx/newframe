import path from 'node:path'

import { Interface, getAddress, hexlify, toUtf8Bytes } from 'ethers'
import type { Locator } from 'playwright-core'

import { anvilChainId, newframeRpcUrl } from '../../core/config.ts'
import { HarnessExtension } from '../../core/extension.ts'
import { sleep } from '../../core/utils.ts'
import { harnessOrigin } from '../driver.ts'
import type { AppState, CurrentRequest, VisualHarnessContext, VisualStage } from '../types.ts'
import { requireAccounts } from './helpers.ts'

const fixturePath = path.join(import.meta.dirname, '..', '..', 'resources', 'safe-address-book.csv')
const usdcAddress = process.env.USDC_ADDRESS ?? '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const opsCoOwner = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const treasuryVault = '0x000000000000000000000000000000000000a11c'
const payroll = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65'
const unnamed = '0x90F79bf6EB2c4f870365E785982E1f101E93b906'
const expectedEntries: Record<string, string> = {
  [opsCoOwner.toLowerCase()]: 'Ops Co-owner',
  [treasuryVault]: 'Treasury Vault',
  '0x0000000000000000000000000000000000001337': 'Test Router',
  [payroll.toLowerCase()]: 'Payroll, Q4'
}

const profileBook = (state: AppState) => state.main?.addressBook?.[state.main.currentProfile ?? ''] ?? {}

async function hoverFullAddress(identity: Locator) {
  await identity.locator('[data-hover-swap-text="primary"]').locator('..').hover()
  return identity.evaluate((element) => {
    const primary = element.querySelector<HTMLElement>('[data-hover-swap-text="primary"]')
    const alternate = element.querySelector<HTMLElement>('[data-hover-swap-text="alternate"]')
    const swapped =
      primary &&
      alternate &&
      getComputedStyle(primary).display === 'none' &&
      getComputedStyle(alternate).display !== 'none'
    return swapped ? alternate.textContent : ''
  })
}

async function rejectRequest({ driver, tray }: VisualHarnessContext, request: CurrentRequest) {
  await driver.executeCommand(tray, { type: 'request.reject', requestId: request.requestId })
  await driver.waitForState(
    (state) =>
      !state.main?.accounts?.[request.accountId]?.requests?.[request.requestId] &&
      driver.currentRequest(state)?.requestId !== request.requestId,
    10_000,
    `Rejected ${request.type ?? 'request'} ${request.requestId} did not clear`
  )
  await driver.clearPanelAndOverlays()
}

async function openAddressBook({ tray }: VisualHarnessContext) {
  await tray.getByRole('button', { name: 'Main menu' }).click()
  const menu = tray.getByRole('dialog', { name: 'Main menu' })
  await menu.getByRole('button', { name: 'Address book' }).click()
  const book = tray.getByRole('dialog', { name: 'Address book' })
  await book.waitFor({ state: 'visible' })
  await sleep(500)
  return book
}

async function closeAddressBook({ tray }: VisualHarnessContext) {
  const book = tray.getByRole('dialog', { name: 'Address book' })
  await book.getByRole('button', { name: 'Back' }).click()
  const menu = tray.getByRole('dialog', { name: 'Main menu' })
  await menu.getByRole('button', { name: 'Close menu' }).click()
  await menu.waitFor({ state: 'hidden' })
}

export const addressBookStage: VisualStage = {
  name: 'address book import and named addresses',
  async run(context) {
    const { driver, runtime, tray } = context
    const { harness } = await requireAccounts(context)
    const harnessName =
      (await driver.getAppState()).main?.accounts?.[harness.id]?.name ??
      runtime.fail('Harness account is missing its name')
    await driver.clearPanelAndOverlays()
    // A copied developer profile may already hold entries; the import counts below assume none.
    for (const address of Object.keys(profileBook(await driver.getAppState()))) {
      await driver.executeCommand(tray, { type: 'address-book.remove', address })
    }
    await driver.waitForState(
      (state) => !Object.keys(profileBook(state)).length,
      5_000,
      'Address book did not clear for the active profile'
    )

    let book = await openAddressBook(context)
    await book.getByRole('button', { name: 'New entry' }).waitFor()
    await book.getByRole('button', { name: 'Import from Gnosis Safe', exact: true }).waitFor()
    await runtime.screenshot(tray, '08aa-address-book-empty.png')

    await book.getByLabel('Gnosis Safe CSV export').setInputFiles(fixturePath)
    const importButton = book.getByRole('button', { name: 'Import 4', exact: true })
    await importButton.waitFor()
    for (const text of ['5 addresses in 12 rows', '4 new', '1 already named', '1 invalid row']) {
      if (!(await book.getByText(text, { exact: true }).isVisible())) {
        runtime.fail(`Import preview must show "${text}"`)
      }
    }
    await runtime.screenshot(tray, '08ab-address-book-import-preview.png')
    await importButton.click()
    const imported = await driver
      .waitForState(
        (state) => Object.keys(profileBook(state)).length === 4,
        10_000,
        'Address book import did not store 4 entries'
      )
      .catch(async () =>
        runtime.fail(`Address book after import: ${JSON.stringify(profileBook(await driver.getAppState()))}`)
      )
    const stored = profileBook(imported)
    for (const [address, name] of Object.entries(expectedEntries)) {
      if (stored[address] !== name) {
        runtime.fail(`Imported entry ${address} must be named "${name}", found "${stored[address] ?? ''}"`)
      }
    }
    if (stored[harness.id]) {
      runtime.fail('Import must skip the harness account, which is already named')
    }
    runtime.evidence('addressBookImportedEntries', Object.keys(stored).length)
    await book.getByRole('button', { name: 'Rename Test Router', exact: true }).waitFor()
    if (await book.getByText('Router (old label)').count()) {
      runtime.fail('A later CSV row must not overwrite the first name for an address')
    }
    await runtime.screenshot(tray, '08ac-address-book-imported.png')

    const search = book.getByRole('textbox', { name: 'Search address book' })
    await search.fill('treas')
    await book.getByRole('button', { name: 'Rename Ops Co-owner', exact: true }).waitFor({ state: 'hidden' })
    const visibleRows = await book.getByRole('button', { name: /^Rename / }).count()
    if (visibleRows !== 1 || !(await book.getByText('Treasury Vault', { exact: true }).isVisible())) {
      runtime.fail(`Searching "treas" must show only Treasury Vault; found ${visibleRows} rows`)
    }
    await runtime.screenshot(tray, '08ad-address-book-search.png')
    await search.fill('')
    await book.getByRole('button', { name: 'Rename Ops Co-owner', exact: true }).waitFor()
    await closeAddressBook(context)

    const extension = await HarnessExtension.connect(newframeRpcUrl)
    const dapp = extension.dapp(`http://${harnessOrigin}`, anvilChainId)
    try {
      const typedData = {
        domain: { name: 'Newframe Address Book', version: '1', chainId: anvilChainId },
        primaryType: 'Payout',
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' }
          ],
          Payout: [
            { name: 'payer', type: 'address' },
            { name: 'approver', type: 'address' },
            { name: 'vault', type: 'address' },
            { name: 'beneficiary', type: 'address' },
            { name: 'memo', type: 'string' }
          ]
        },
        message: {
          payer: getAddress(harness.address),
          approver: opsCoOwner,
          vault: treasuryVault,
          beneficiary: unnamed,
          memo: 'Quarterly payout'
        }
      }
      void dapp
        .send('eth_signTypedData_v4', [harness.address, JSON.stringify(typedData)])
        .catch(() => undefined)
      const typedRequest = await driver.waitForCurrentRequest('signTypedData', new Set(), 30_000)
      for (const name of ['Ops Co-owner', 'Treasury Vault']) {
        await tray.locator('[data-address-identity]').filter({ hasText: name }).first().waitFor()
      }
      if ((await tray.locator('[data-address-identity]').filter({ hasText: harnessName }).count()) < 1) {
        runtime.fail('Typed data must name the harness account')
      }
      await tray.getByText(unnamed, { exact: true }).waitFor()
      const vaultAddress = await hoverFullAddress(
        tray.locator('[data-address-identity]').filter({ hasText: 'Treasury Vault' }).first()
      )
      if (vaultAddress.toLowerCase() !== treasuryVault) {
        runtime.fail(`Hovering Treasury Vault must reveal its full address; found "${vaultAddress}"`)
      }
      await runtime.screenshot(tray, '08ae-typed-data-named-addresses.png')
      runtime.evidence('typedDataNamedAddresses', 3)
      await rejectRequest(context, typedRequest)

      const siwe = [
        `${harnessOrigin} wants you to sign in with your Ethereum account:`,
        getAddress(harness.address),
        '',
        'Sign in to the Newframe harness.',
        '',
        `URI: http://${harnessOrigin}`,
        'Version: 1',
        `Chain ID: ${anvilChainId}`,
        'Nonce: addressbook01',
        `Issued At: ${new Date().toISOString()}`
      ].join('\n')
      void dapp.send('personal_sign', [hexlify(toUtf8Bytes(siwe)), harness.address]).catch(() => undefined)
      const signRequest = await driver.waitForCurrentRequest('sign', new Set(), 30_000)
      await tray.getByText('wants you to sign in', { exact: true }).waitFor()
      if (await tray.getByText('Address in message', { exact: true }).count()) {
        runtime.fail('A sign-in review must not show a separate address row')
      }
      await tray.getByText('Sign-in details', { exact: true }).click()
      const signInDetails = tray.locator('details').filter({ hasText: 'Sign-in details' })
      const inlineName = signInDetails
        .locator('[data-hover-swap-text="primary"]')
        .filter({ hasText: harnessName })
      await inlineName.waitFor()
      await runtime.screenshot(tray, '08af-siwe-named-address.png')
      await inlineName.locator('..').hover()
      const revealed = await signInDetails
        .locator('[data-hover-swap-text="alternate"]')
        .evaluate((alternate) => ({
          display: getComputedStyle(alternate).display,
          text: alternate.textContent
        }))
      if (revealed.display === 'none' || revealed.text.toLowerCase() !== harness.address.toLowerCase()) {
        runtime.fail('Hovering the named address in the sign-in details must show the full address')
      }
      await tray.getByText('Raw message', { exact: true }).click()
      const rawMessage = await tray.getByLabel('Message to sign').textContent()
      if (rawMessage !== siwe) {
        runtime.fail('The raw sign-in message must stay exactly as signed')
      }
      await runtime.screenshot(tray, '08af-siwe-hover-address.png')
      await rejectRequest(context, signRequest)

      const transfer = new Interface(['function transfer(address to, uint256 amount)'])
      void dapp
        .send('eth_sendTransaction', [
          {
            from: harness.address,
            to: usdcAddress,
            value: '0x0',
            data: transfer.encodeFunctionData('transfer', [treasuryVault, 1_000_000n])
          }
        ])
        .catch(() => undefined)
      const transactionRequest = await driver.waitForCurrentRequest('transaction', new Set(), 30_000)
      await tray
        .getByLabel('Transaction details')
        .locator('[data-address-identity]')
        .filter({ hasText: 'Treasury Vault' })
        .waitFor()
      // Simulated balance changes carry no counterparty; the decoded recipient is where the name shows.
      await tray
        .getByLabel('Transaction effects')
        .getByRole('group', { name: 'Outgoing asset effect' })
        .filter({ hasText: 'USDC' })
        .waitFor({ timeout: 15_000 })
      await runtime.screenshot(tray, '08ag-erc20-transfer-named-recipient.png')
      runtime.evidence('transferRecipientName', 'Treasury Vault')
      await rejectRequest(context, transactionRequest)
    } finally {
      dapp.destroy()
      extension.close()
    }

    const payrollId = payroll.toLowerCase()
    book = await openAddressBook(context)
    await book.getByRole('button', { name: 'Watch Payroll, Q4 as account', exact: true }).click()
    const promoted = await driver.waitForState(
      (state) => Boolean(state.main?.accounts?.[payrollId]) && !profileBook(state)[payrollId],
      15_000,
      'Watching Payroll, Q4 did not move it from the address book to the accounts'
    )
    if (promoted.main?.accounts?.[payrollId]?.name !== 'Payroll, Q4') {
      runtime.fail('A promoted entry must keep its address book name')
    }
    await book.getByRole('button', { name: 'Rename Payroll, Q4', exact: true }).waitFor({ state: 'hidden' })
    await closeAddressBook(context)

    await tray.getByRole('button', { name: 'Accounts', exact: true }).click()
    const accounts = tray.getByRole('dialog', { name: 'Accounts' })
    await accounts.getByRole('textbox', { name: 'Search accounts' }).fill('Payroll')
    await accounts.getByRole('button', { name: 'Clear Search accounts' }).waitFor()
    await accounts.getByRole('button', { name: 'Payroll, Q4 account actions', exact: true }).click()
    const moveToBook = accounts.getByRole('button', { name: 'Move to address book', exact: true })
    await moveToBook.waitFor()
    await runtime.screenshot(tray, '08ah-address-book-watched-account.png')
    await moveToBook.click()
    const demoted = await driver.waitForState(
      (state) => !state.main?.accounts?.[payrollId] && profileBook(state)[payrollId] === 'Payroll, Q4',
      15_000,
      'Moving Payroll, Q4 to the address book did not replace the account with an entry'
    )
    runtime.evidence('addressBookEntriesAfterRoundTrip', Object.keys(profileBook(demoted)).length)
    await accounts.getByRole('button', { name: 'Close accounts', exact: true }).click()
    await accounts.waitFor({ state: 'hidden' })
    await driver.setSelectedAccount(harness)

    book = await openAddressBook(context)
    await book.getByRole('button', { name: 'Rename Payroll, Q4', exact: true }).waitFor()
    if ((await book.getByRole('button', { name: /^Rename / }).count()) !== 4) {
      runtime.fail('Address book must list the 4 imported entries after the round trip')
    }
    await runtime.screenshot(tray, '08ai-address-book-round-trip.png')
    await closeAddressBook(context)
    await driver.clearPanelAndOverlays()
  }
}
