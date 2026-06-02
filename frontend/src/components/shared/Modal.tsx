import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Icon } from './Icon'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  className?: string
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (open) ref.current?.showModal()
    else ref.current?.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className={cn(
        'backdrop:bg-black/60 bg-surface border border-line rounded-xl p-0 w-full max-w-lg shadow-2xl text-text m-auto',
        className
      )}
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-line">
        <h2 className="text-lg font-medium">{title}</h2>
        <button onClick={onClose} className="text-muted hover:text-text cursor-pointer">
          <Icon name="plus" size={18} style={{ transform: 'rotate(45deg)' }} />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  )
}
