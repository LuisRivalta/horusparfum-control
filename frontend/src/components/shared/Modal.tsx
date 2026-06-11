import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Icon } from './Icon'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export function Modal({ open, onClose, title, children, className, size = 'md' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (open) ref.current?.showModal()
    else ref.current?.close()
  }, [open])

  const sizeClass = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }[size]

  return (
    <dialog
      ref={ref}
      open={open || undefined}
      onClose={onClose}
      className={cn(
        'gold-hairline bg-surface border border-line-2 rounded-2xl p-0 w-full text-text m-auto',
        'shadow-[0_32px_80px_-20px_rgba(0,0,0,0.7),0_0_40px_-24px_rgba(201,168,76,0.3)]',
        open && 'open:animate-[scale-in_0.3s_cubic-bezier(0.22,1,0.36,1)]',
        sizeClass,
        className
      )}
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-line">
        <h2 className="text-2xl font-serif font-semibold tracking-wide">{title}</h2>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-text hover:bg-surface-2 hover:rotate-90 transition-all duration-300 cursor-pointer"
          aria-label="Fechar"
        >
          <Icon name="plus" size={18} style={{ transform: 'rotate(45deg)' }} />
        </button>
      </div>
      <div className="p-6">{children}</div>
    </dialog>
  )
}
