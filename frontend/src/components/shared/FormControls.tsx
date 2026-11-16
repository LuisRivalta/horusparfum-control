import { useEffect, useId, useMemo, useRef, useState } from 'react'
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

type SelectOption = { value: string | number; label: string }

interface SelectProps {
  label?: string
  options: SelectOption[]
  value?: string | number
  /** Mesmo formato do onChange do <select> nativo: e.target.value é sempre string */
  onChange?: (e: { target: { value: string } }) => void
  /** false: sem opção vazia (o valor nunca fica em branco) */
  placeholder?: string | false
  disabled?: boolean
  required?: boolean
  className?: string
  id?: string
  'aria-label'?: string
}

const BUSCA_A_PARTIR_DE = 10

// Seletor próprio no lugar do <select> nativo (cuja lista aberta é do sistema e não segue o tema).
// A lista abre como popover: fica na camada de cima, acima do <dialog> dos modais e sem ser cortada.
export function Select({
  label, options, value = '', onChange, placeholder = 'Selecione...', disabled, required, className, id, ...aria
}: SelectProps) {
  const autoId = useId()
  const selectId = id || autoId
  const listId = `${selectId}-lista`
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const buscaRef = useRef<HTMLInputElement>(null)
  const [aberto, setAberto] = useState(false)
  const [ativo, setAtivo] = useState(0)
  const [busca, setBusca] = useState('')
  const [pos, setPos] = useState<React.CSSProperties>({})

  // a opção vazia vem do chamador ou do placeholder (antes saíam as duas, repetidas)
  const todas = useMemo(() => {
    const ops = options.map((o) => ({ value: String(o.value), label: o.label }))
    return placeholder === false || ops.some((o) => o.value === '') ? ops : [{ value: '', label: placeholder }, ...ops]
  }, [options, placeholder])
  const visiveis = busca
    ? todas.filter((o) => o.value !== '' && normalizar(o.label).includes(normalizar(busca)))
    : todas
  const atual = todas.find((o) => o.value === String(value))
  const vazio = !atual || atual.value === ''

  function abrir() {
    if (disabled) return
    const r = btnRef.current!.getBoundingClientRect()
    const altura = Math.min(288, 44 + todas.length * 36)
    const abaixo = window.innerHeight - r.bottom
    const emCima = abaixo < altura + 8 && r.top > abaixo
    setPos({
      position: 'fixed', inset: 'auto', margin: 0, left: r.left, width: Math.max(r.width, 180),
      ...(emCima ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
    })
    setBusca('')
    setAtivo(Math.max(0, todas.findIndex((o) => o.value === String(value))))
    setAberto(true)
  }
  function fechar(focar = true) {
    setAberto(false)
    if (focar) btnRef.current?.focus()
  }
  function escolher(v: string) {
    if (v !== String(value)) onChange?.({ target: { value: v } })
    fechar()
  }

  useEffect(() => {
    if (!aberto) return
    const pop = popRef.current
    pop?.showPopover?.()
    buscaRef.current?.focus()
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node
      if (!pop?.contains(alvo) && !btnRef.current?.contains(alvo)) fechar(false)
    }
    // rolar a página tira a lista do lugar: fecha (a rolagem da própria lista não conta)
    const rolou = (e: Event) => { if (!pop?.contains(e.target as Node)) fechar(false) }
    const redim = () => fechar(false)
    document.addEventListener('mousedown', fora)
    window.addEventListener('scroll', rolou, true)
    window.addEventListener('resize', redim)
    return () => {
      document.removeEventListener('mousedown', fora)
      window.removeEventListener('scroll', rolou, true)
      window.removeEventListener('resize', redim)
      if (pop?.matches?.(':popover-open')) pop.hidePopover()
    }
  }, [aberto])

  useEffect(() => {
    if (aberto) popRef.current?.querySelector(`[data-indice="${ativo}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [ativo, aberto])

  function teclado(e: React.KeyboardEvent) {
    if (!aberto) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); abrir() }
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar() } // não fecha o modal junto
    else if (e.key === 'Tab') fechar(false)
    else if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo((i) => Math.min(i + 1, visiveis.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Home') { e.preventDefault(); setAtivo(0) }
    else if (e.key === 'End') { e.preventDefault(); setAtivo(visiveis.length - 1) }
    else if (e.key === 'Enter') { e.preventDefault(); if (visiveis[ativo]) escolher(visiveis[ativo].value) }
    else if (todas.length < BUSCA_A_PARTIR_DE && e.key.length === 1) {
      // sem caixa de busca: a letra pula para a próxima opção que começa com ela
      const l = normalizar(e.key)
      const prox = visiveis.findIndex((o, i) => i > ativo && normalizar(o.label).startsWith(l))
      const idx = prox >= 0 ? prox : visiveis.findIndex((o) => normalizar(o.label).startsWith(l))
      if (idx >= 0) setAtivo(idx)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-xs font-medium uppercase tracking-[.08em] text-muted">
          {label}
        </label>
      )}
      <div className="relative">
        <button
          ref={btnRef}
          id={selectId}
          type="button"
          role="combobox"
          value={String(value)}
          aria-label={aria['aria-label']}
          aria-haspopup="listbox"
          aria-expanded={aberto}
          aria-controls={aberto ? listId : undefined}
          aria-required={required || undefined}
          disabled={disabled}
          onClick={() => (aberto ? fechar() : abrir())}
          onKeyDown={teclado}
          className={cn(
            'w-full flex items-center gap-2 px-3.5 py-2.5 pr-9 rounded-lg border border-line bg-surface-2 text-sm text-left cursor-pointer',
            'transition-all duration-200 focus:outline-none focus-visible:border-gold/60 focus-visible:shadow-[0_0_0_3px_rgba(201,168,76,0.12)]',
            'hover:border-line-2 disabled:opacity-50 disabled:cursor-not-allowed',
            aberto && 'border-gold/60 shadow-[0_0_0_3px_rgba(201,168,76,0.12)]',
            vazio ? 'text-faint' : 'text-text',
            className
          )}
        >
          <span className="truncate">{atual?.label ?? (placeholder || 'Selecione...')}</span>
        </button>
        <svg
          className={cn('pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted transition-transform duration-200', aberto && 'rotate-180 text-gold')}
          width="12" height="12" viewBox="0 0 12 12" fill="none"
        >
          <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {/* mantém a validação "obrigatório" do formulário, que o <select> fazia */}
        {required && (
          <input
            tabIndex={-1} aria-hidden required value={vazio ? '' : String(value)} onChange={() => {}}
            onFocus={() => btnRef.current?.focus()}
            className="absolute inset-x-0 bottom-0 h-px opacity-0 pointer-events-none"
          />
        )}
      </div>

      {aberto && (
        <div
          ref={popRef}
          popover="manual"
          style={pos}
          className="z-50 flex flex-col max-h-72 p-1 rounded-xl border border-line-2 bg-raise text-text shadow-[0_18px_48px_-12px_rgba(0,0,0,0.6),0_0_0_1px_rgba(201,168,76,0.08)] animate-[scale-in_0.14s_cubic-bezier(0.22,1,0.36,1)] origin-top"
        >
          {todas.length >= BUSCA_A_PARTIR_DE && (
            <input
              ref={buscaRef}
              value={busca}
              onChange={(e) => { setBusca(e.target.value); setAtivo(0) }}
              onKeyDown={teclado}
              placeholder="Buscar…"
              aria-label="Buscar opção"
              className="mb-1 px-3 py-2 rounded-lg border border-line bg-surface-2 text-sm text-text placeholder:text-faint focus:outline-none focus:border-gold/60"
            />
          )}
          <ul id={listId} role="listbox" aria-labelledby={selectId} className="overflow-y-auto" data-lenis-prevent>
            {visiveis.length === 0 && <li className="px-3 py-2 text-sm text-faint">Nada encontrado</li>}
            {visiveis.map((o, i) => {
              const sel = o.value === String(value)
              return (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={sel}
                  data-value={o.value}
                  data-indice={i}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setAtivo(i)}
                  onClick={() => escolher(o.value)}
                  className={cn(
                    'flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors duration-100',
                    i === ativo && 'bg-gold-dim',
                    sel ? 'text-gold' : o.value === '' ? 'text-faint' : 'text-text'
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  {sel && o.value !== '' && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                      <path d="M4 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
