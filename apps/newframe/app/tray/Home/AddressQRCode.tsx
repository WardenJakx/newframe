import React, { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

import { resolveSystemColor } from '../../../resources/style/tokens/colors'

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

  return <canvas aria-label='Account address QR code' className='t2ReceiveQrCanvas' ref={canvasRef} />
}
