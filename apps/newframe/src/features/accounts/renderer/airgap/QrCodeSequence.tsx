import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { resolveSystemColor } from '@newframe/ui/tokens/colors'
import { Text } from '@newframe/ui/text'
import { Stack } from '@newframe/ui/stack'
import { cva } from '../../../../../generated/styled-system/css/cva.js'

const canvasRecipe = cva({
  base: {
    display: 'block',
    width: '100%',
    maxWidth: '280px',
    aspectRatio: '1',
    borderRadius: 'control',
    background: 'qr.background'
  }
})

export function QrCodeSequence({ active, frames }: { active: boolean; frames: string[] }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!active || !canvas.current || !frames.length) return
    let current = true
    let index = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const draw = () => {
      if (!current || document.visibilityState === 'hidden' || !canvas.current) return
      void QRCode.toCanvas(canvas.current, frames[index], {
        width: 280,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: resolveSystemColor('qr-foreground'), light: resolveSystemColor('qr-background') }
      })
        .then(() => {
          if (!current) return
          index = (index + 1) % frames.length
          if (frames.length > 1) timer = setTimeout(draw, 200)
        })
        .catch(() => {
          if (current) setError('Could not display the signing QR. Cancel and try signing again.')
        })
    }
    const visibility = () => {
      clearTimeout(timer)
      draw()
    }
    document.addEventListener('visibilitychange', visibility)
    draw()
    return () => {
      current = false
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [active, frames])
  return (
    <Stack align='center' gap='small'>
      <canvas ref={canvas} aria-label='AirGap signing request QR' className={canvasRecipe()} />
      {frames.length > 1 ? (
        <Text variant='caption'>Animated QR, keep scanning until Vault finishes</Text>
      ) : null}
      {error ? (
        <div role='alert'>
          <Text tone='danger'>{error}</Text>
        </div>
      ) : null}
    </Stack>
  )
}
