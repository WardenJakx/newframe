import { useState } from 'react'
import link from '../link'

const useCopiedMessage = (value: string): [boolean, () => void] => {
  const [showMessage, setShowMessage] = useState(false)

  const copyToClipboard = () => {
    void link.executeCommand({ type: 'clipboard.write', text: value })
    setShowMessage(true)
    setTimeout(() => setShowMessage(false), 1000)
  }

  return [showMessage, copyToClipboard]
}

export default useCopiedMessage
