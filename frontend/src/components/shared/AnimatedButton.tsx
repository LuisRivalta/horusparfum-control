import type { ButtonHTMLAttributes, ReactNode } from 'react'
import './AnimatedButton.css'

interface AnimatedButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  children: ReactNode
  type?: 'button' | 'submit' | 'reset'
  loading?: boolean
  loadingText?: string
}

export function AnimatedButton({
  children,
  type = 'button',
  loading = false,
  loadingText,
  disabled,
  className = '',
  ...rest
}: AnimatedButtonProps) {
  const isDisabled = disabled || loading

  return (
    <button
      type={type}
      disabled={isDisabled}
      className={`animated-button ${className}`.trim()}
      {...rest}
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="arr-2" viewBox="0 0 24 24">
        <path d="M16.1716 10.9999L10.8076 5.63589L12.2218 4.22168L20 11.9999L12.2218 19.778L10.8076 18.3638L16.1716 12.9999H4V10.9999H16.1716Z" />
      </svg>
      <span className="text">{loading && loadingText ? loadingText : children}</span>
      <span className="circle" />
      <svg xmlns="http://www.w3.org/2000/svg" className="arr-1" viewBox="0 0 24 24">
        <path d="M16.1716 10.9999L10.8076 5.63589L12.2218 4.22168L20 11.9999L12.2218 19.778L10.8076 18.3638L16.1716 12.9999H4V10.9999H16.1716Z" />
      </svg>
    </button>
  )
}
