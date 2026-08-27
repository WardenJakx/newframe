import { describe, expect, it } from 'bun:test'

import { frameConnectionPresentation, siteConnectionPresentation } from './connectionPresentation'

describe('connection presentation', () => {
  it('distinguishes an unavailable desktop app from a pending extension approval', () => {
    expect(frameConnectionPresentation('desktop-unavailable')).toStrictEqual({
      connected: false,
      label: 'Newframe Not Running',
      tone: 'danger'
    })
    expect(frameConnectionPresentation('extension-approval-pending')).toStrictEqual({
      connected: false,
      label: 'Approval Needed',
      tone: 'warning'
    })
  })

  it('marks a website connection request as pending instead of successful', () => {
    expect(siteConnectionPresentation(false, '0xabc')).toStrictEqual({
      label: 'Approval needed',
      tone: 'warning',
      value: 'Approve this site in Newframe'
    })
  })
})
