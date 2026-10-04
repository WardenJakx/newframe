import { screen } from 'electron'

import { isVisualHarness, visualHarnessWorkArea } from '../../runtime/visualHarness.ts'

export function cursorWorkArea() {
  return isVisualHarness
    ? visualHarnessWorkArea
    : screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
}
