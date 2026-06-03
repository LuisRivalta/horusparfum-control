import { cn } from '@/lib/utils'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}

export function Button({ variant = 'primary', size = 'md', className, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap',
        size === 'sm' && 'px-3 py-1.5 text-xs',
        size === 'md' && 'px-4 py-2.5 text-sm',
        variant === 'primary' && 'bg-gold text-[#1A1407] hover:bg-gold/90',
        variant === 'secondary' && 'border border-line bg-surface-2 text-text hover:bg-raise',
        variant === 'ghost' && 'text-muted hover:text-text hover:bg-surface-2',
        variant === 'danger' && 'bg-down/10 border border-down/30 text-down hover:bg-down/20',
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
}

export function Input({ label, className, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm text-text-2">{label}</label>}
      <input
        className={cn(
          'w-full px-3 py-2.5 rounded-lg border border-line bg-surface-2 text-text text-sm placeholder:text-faint focus:outline-none focus:border-gold/50',
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
}

export function Select({ label, options, className, ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm text-text-2">{label}</label>}
      <select
        className={cn(
          'w-full px-3 py-2.5 rounded-lg border border-line bg-surface-2 text-text text-sm focus:outline-none focus:border-gold/50',
          className
        )}
        {...props}
      >
        <option value="">Selecione...</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
