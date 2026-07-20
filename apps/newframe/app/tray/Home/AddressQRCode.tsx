import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

import { resolveSystemColor } from '@newframe/ui/tokens/colors'

import { cva } from '../../../resources/styled-system/css/cva.js'

const qrFrameRecipe = cva({
  base: {
    width: 'qr-code',
    height: 'qr-code',
    display: 'grid',
    flexShrink: 0,
    placeItems: 'center',
    overflow: 'hidden',
    borderRadius: 'control',
    background: 'qr.background'
  }
})

const qrCanvasRecipe = cva({
  base: { display: 'block', width: '100%', maxWidth: '100%', height: '100%', maxHeight: '100%' }
})

export default function AddressQRCode({ address }: { address: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!canvasRef.current || !address) return

    QRCode.toCanvas(canvasRef.current, address, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 156,
      color: {
        dark: resolveSystemColor('qr-foreground'),
        light: resolveSystemColor('qr-background')
      }
    }).catch((err) => console.error('Unable to render QR code', err))
  }, [address])

  return (
    <span className={qrFrameRecipe()}>
      <canvas aria-label='Account address QR code' className={qrCanvasRecipe()} ref={canvasRef} />
    </span>
  )
}
