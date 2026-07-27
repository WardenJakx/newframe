import windows from '../../windows'
import type { SideTrayWindowCapability } from '../../operations/sideTrayWorkflows'

export function createProductionSideTrayWindowCapability(): SideTrayWindowCapability {
  return {
    close: (event) => setTimeout(() => windows.close(event), 0),
    inspect: (event, x, y) => {
      if (process.env.NODE_ENV === 'development') event.sender.inspectElement(x, y)
    }
  }
}
