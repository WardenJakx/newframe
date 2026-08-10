import { useState } from 'react'
import type { RequestExternalCapability } from '../requestCapabilities'

const useCopiedMessage = (
  capability: Pick<RequestExternalCapability, 'copy'>,
  value: string
): [boolean, () => void] => {
  const [showMessage, setShowMessage] = useState(false)

  const copyToClipboard = () => {
    void capability.copy({ text: value })
    setShowMessage(true)
    setTimeout(() => setShowMessage(false), 1000)
  }

  return [showMessage, copyToClipboard]
}

export default useCopiedMessage
