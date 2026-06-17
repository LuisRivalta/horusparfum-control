import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

interface Aba { id: string; label: string; icon: string; path: string; tabela: string }

const ABAS: Aba[] = [
  { id: 'produtos', label: 'Produtos', icon: 'tag', path: '/estoque/cadastros/produtos', tabela: 'produtos' },
  { id: 'categorias', label: 'Categorias', icon: 'grid', path: '/estoque/cadastros/categorias', tabela: 'categorias' },
  { id: 'fornecedores', label: 'Fornecedores', icon: 'supplier', path: '/estoque/cadastros/fornecedores', tabela: 'fornecedores' },
]

export function Cadastros() {
  const location = useLocation()
  const [actionSlot, setActionSlot] = useState<HTMLDivElement | null>(null)
  const [contagens, setContagens] = useState<Record<string, number | null>>({
    produtos: null, categorias: null, fornecedores: null,
  })

  useEffect(() => {
    ABAS.forEach((aba) => {
      supabase.from(aba.tabela).select('id', { count: 'exact', head: true })
        .then(({ count, error }) => {
          if (error) { console.error('Erro ao contar', aba.tabela, error); return }
          setContagens((prev) => ({ ...prev, [aba.id]: count ?? 0 }))
        })
    })
  }, [])

  const activeIndex = Math.max(0, ABAS.findIndex((a) => location.pathname.startsWith(a.path)))

  return (
    <div className="flex flex-col">
      <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold flex items-center gap-2">
        <span className="w-1 h-1 bg-gold rotate-45 shrink-0" />
        Estoque / Cadastros
      </p>
      <h1 className="text-4xl tracking-tight mt-1.5">Cadastros</h1>

      <div className="flex items-center justify-between gap-4 flex-wrap mt-5">
        <div className="relative inline-flex bg-surface-2 border border-line-2 rounded-xl p-1">
          <span
            className="absolute top-1 bottom-1 left-1 w-[160px] rounded-lg bg-gold shadow-[0_3px_14px_rgba(201,168,76,0.34)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ transform: `translateX(${activeIndex * 160}px)` }}
          />
          {ABAS.map((aba) => {
            const ativo = location.pathname.startsWith(aba.path)
            const c = contagens[aba.id]
            return (
              <NavLink
                key={aba.id}
                to={aba.path}
                className={cn(
                  'relative z-10 w-[160px] flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg transition-colors',
                  ativo ? 'text-[#1A1407] font-semibold' : 'text-text-2 font-medium hover:text-gold'
                )}
              >
                <Icon name={aba.icon} size={17} />
                {aba.label}
                <span className={cn(
                  'font-mono text-[11px] px-1.5 py-px rounded-full tabular-nums',
                  ativo ? 'bg-[#1A1407]/15 text-[#1A1407]' : 'bg-line text-muted'
                )}>
                  {c === null ? '—' : c}
                </span>
              </NavLink>
            )
          })}
        </div>

        <div ref={setActionSlot} className="flex items-center gap-2" />
      </div>

      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent to-gold/30" />
        <span className="w-1.5 h-1.5 bg-gold rotate-45" />
        <div className="flex-1 h-px bg-gradient-to-l from-transparent to-gold/30" />
      </div>

      <Outlet context={{ actionSlot }} />
    </div>
  )
}
