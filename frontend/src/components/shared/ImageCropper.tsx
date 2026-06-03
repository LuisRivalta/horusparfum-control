import { useState, useCallback } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { Modal } from './Modal'
import { Button } from './FormControls'

interface ImageCropperProps {
  open: boolean
  imageSrc: string | null
  onCancel: () => void
  onConfirm: (croppedFile: File) => void
  aspect?: number
}

async function getCroppedImg(imageSrc: string, crop: Area): Promise<File> {
  const image = new Image()
  image.src = imageSrc
  await new Promise((resolve) => (image.onload = resolve))

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  canvas.width = crop.width
  canvas.height = crop.height

  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height
  )

  return new Promise<File>((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(new File([blob], 'cropped.jpg', { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.9
    )
  })
}

export function ImageCropper({ open, imageSrc, onCancel, onConfirm, aspect = 1 }: ImageCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [loading, setLoading] = useState(false)

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels)
  }, [])

  async function handleConfirm() {
    if (!imageSrc || !croppedAreaPixels) return
    setLoading(true)
    try {
      const file = await getCroppedImg(imageSrc, croppedAreaPixels)
      onConfirm(file)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onCancel} title="Ajustar foto">
      <div className="flex flex-col gap-4">
        <div className="relative w-full h-80 bg-bg rounded-lg overflow-hidden">
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted font-mono">−</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-gold"
          />
          <span className="text-xs text-muted font-mono">+</span>
          <span className="text-xs text-muted font-mono w-10 text-right">{zoom.toFixed(2)}x</span>
        </div>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
          <Button type="button" onClick={handleConfirm} disabled={loading}>
            {loading ? 'Processando...' : 'Aplicar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
