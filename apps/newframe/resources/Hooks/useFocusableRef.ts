import { useEffect, useRef } from 'react'

const useFocusableRef = (focus?: boolean, delay = 900) => {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (focus) {
      const timeout = setTimeout(() => ref.current && ref.current.focus(), delay)
      return () => clearTimeout(timeout)
    }
  })

  return ref
}

export default useFocusableRef
