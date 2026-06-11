import { useId } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}

export function Button({ variant = 'primary', size = 'md', className, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium cursor-pointer whitespace-nowrap',
        'transition-all duration-200 active:scale-[0.97]',
        size === 'sm' && 'px-3 py-1.5 text-xs',
        size === 'md' && 'px-4 py-2.5 text-sm',
        variant === 'primary' &&
          'sheen-hover text-[#1A1407] bg-gradient-to-b from-gold-bright to-gold shadow-[0_2px_14px_rgba(201,168,76,0.25)] hover:shadow-[0_4px_22px_rgba(201,168,76,0.4)] hover:-translate-y-px',
        variant === 'secondary' &&
          'border border-line bg-surface-2 text-text hover:bg-raise hover:border-gold-line hover:-translate-y-px',
        variant === 'ghost' && 'text-muted hover:text-text hover:bg-surface-2',
        variant === 'danger' &&
          'bg-down/10 border border-down/30 text-down hover:bg-down/20 hover:border-down/50',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  id?: string
}

export function Input({ label, className, id, ...props }: InputProps) {
  const autoId = useId()
  const inputId = id || autoId
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium uppercase tracking-[.08em] text-muted">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          'w-full px-3.5 py-2.5 rounded-lg border border-line bg-surface-2 text-text text-sm placeholder:text-faint',
          'transition-all duration-200 focus:outline-none focus:border-gold/60 focus:shadow-[0_0_0_3px_rgba(201,168,76,0.12)]',
          'hover:border-line-2',
          className
        )}
        {...props}
      />
    </div>
  )
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: { value: string; label: string }[]
  id?: string
}

export function Select({ label, options, className, id, ...props }: SelectProps) {
  const autoId = useId()
  const selectId = id || autoId
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-xs font-medium uppercase tracking-[.08em] text-muted">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          className={cn(
            'w-full appearance-none px-3.5 py-2.5 pr-9 rounded-lg border border-line bg-surface-2 text-text text-sm cursor-pointer',
            'transition-all duration-200 focus:outline-none focus:border-gold/60 focus:shadow-[0_0_0_3px_rgba(201,168,76,0.12)]',
            'hover:border-line-2',
            className
          )}
          {...props}
        >
          <option value="">Selecione...</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {/* Chevron customizado */}
        <svg
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
          width="12" height="12" viewBox="0 0 12 12" fill="none"
        >
          <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  )
}
