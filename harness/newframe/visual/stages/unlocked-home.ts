import { sleep } from '../../core/utils.ts'
import type { VisualStage } from '../types.ts'

export const unlockedHomeStage: VisualStage = {
  name: 'unlocked home',
  async run({ runtime, tray }) {
    const refresh = tray.getByRole('button', { name: 'Refresh balances' })
    const refreshWrapper = refresh.locator('..')
    const portfolioValue = tray.getByRole('group', { name: 'Portfolio value' })
    const send = tray.getByRole('button', { name: 'Send', exact: true })
    const navigation = tray.getByRole('navigation')
    const accountSelector = tray.getByRole('button', { name: 'Accounts' })

    const restingOpacity = Number(
      await refreshWrapper.evaluate((element) => getComputedStyle(element).opacity)
    )
    if (restingOpacity !== 0) runtime.fail('Portfolio refresh must be hidden until hover or focus')

    await portfolioValue.hover()
    await sleep(200)
    const hoverOpacity = Number(await refreshWrapper.evaluate((element) => getComputedStyle(element).opacity))
    if (hoverOpacity !== 1) runtime.fail('Portfolio refresh must become visible when the value is hovered')

    const [valueHoverBounds, refreshBounds] = await Promise.all([
      portfolioValue.boundingBox(),
      refreshWrapper.boundingBox()
    ])
    if (!valueHoverBounds || !refreshBounds)
      runtime.fail('Portfolio refresh hover targets must be measurable')
    const valueEdge = valueHoverBounds.x + valueHoverBounds.width
    await tray.mouse.move((valueEdge + refreshBounds.x) / 2, refreshBounds.y + refreshBounds.height / 2)
    await sleep(200)
    const bridgeOpacity = Number(
      await refreshWrapper.evaluate((element) => getComputedStyle(element).opacity)
    )
    if (bridgeOpacity !== 1) runtime.fail('Portfolio refresh hover target must bridge the gap from the value')
    await refresh.hover()
    await sleep(200)
    const controlOpacity = Number(
      await refreshWrapper.evaluate((element) => getComputedStyle(element).opacity)
    )
    if (controlOpacity !== 1)
      runtime.fail('Portfolio refresh must remain visible while its button is hovered')

    const [accountBounds, valueBounds, sendBounds, navigationBounds] = await Promise.all([
      accountSelector.boundingBox(),
      portfolioValue.boundingBox(),
      send.boundingBox(),
      navigation.boundingBox()
    ])
    if (!accountBounds || !valueBounds || valueBounds.y - (accountBounds.y + accountBounds.height) < 8) {
      runtime.fail('Portfolio value must have space below the account selector')
    }
    if (!sendBounds || !navigationBounds || navigationBounds.y - (sendBounds.y + sendBounds.height) < 16) {
      runtime.fail('Portfolio actions must have space above the home navigation')
    }

    await navigation.hover()
    await sleep(200)
    const departedOpacity = Number(
      await refreshWrapper.evaluate((element) => getComputedStyle(element).opacity)
    )
    if (departedOpacity !== 0) runtime.fail('Portfolio refresh must hide after the value loses hover')
    await runtime.screenshot(tray, '02-unlocked-home.png')
  }
}
