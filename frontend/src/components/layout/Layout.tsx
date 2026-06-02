import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Mark } from '@/components/shared/Mark'
import { Icon } from '@/components/shared/Icon'

const FIN_NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', path: '/financeiro' },
  { id: 'transacoes', label: 'Transações', icon: 'swap', path: '/financeiro/transacoes' },
  { id: 'pagar', label: 'Contas a pagar', icon: 'up', path: '/financeiro/contas-pagar' },
  { id: 'receber', label: 'Contas a receber', icon: 'down', path: '/financeiro/contas-receber' },
  { id: 'relatorios', label: 'Relatórios', icon: 'report', path: '/financeiro/relatorios' },
  { id: 'metas', label: 'Metas', icon: 'goal', path: '/financeiro/metas' },
]

const EST_NAV = [
  { id: 'produtos', label: 'Produtos', icon: 'box', path: '/estoque' },
  { id: 'movimentacoes', label: 'Movimentações', icon: 'swap', path: '/estoque/movimentacoes' },
  { id: 'categorias', label: 'Categorias', icon: 'grid', path: '/estoque/categorias' },
  { id: 'fornecedores', label: 'Fornecedores', icon: 'supplier', path: '/estoque/fornecedores' },
  { id: 'alertas', label: 'Alertas', icon: 'alert', path: '/estoque/alertas' },
  { id: 'relatorios', label: 'Relatório de giro', icon: 'report', path: '/estoque/relatorios' },
]

export function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  const isFin = location.pathname.startsWith('/financeiro')
  const nav = isFin ? FIN_NAV : EST_NAV

  return (
    <div className={cn('flex h-screen', collapsed && 'group/collapsed')}>
      <aside
        className={cn(
          'flex flex-col border-r border-line bg-surface transition-[width]',
          collapsed ? 'w-[74px]' : 'w-[236px]'
        )}
      >
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-3 px-3 py-4 border-b border-line cursor-pointer"
          title="Início"
        >
          <Mark size={30} />
          {!collapsed && (
            <span className="font-serif font-semibold text-lg tracking-wide">
              HORUS<span className="block text-[0.42em] tracking-[.34em] text-gold">PARFUM</span>
            </span>
          )}
        </button>

        <div className="px-3 pt-3 pb-1 font-mono text-[0.62rem] uppercase tracking-[.2em] text-faint">
          {!collapsed && (isFin ? 'Financeiro' : 'Estoque')}
        </div>

        <nav className="flex flex-col gap-0.5 flex-1 px-2">
          {nav.map((item) => {
            const active = location.pathname === item.path
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                className={cn(
                  'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors cursor-pointer whitespace-nowrap',
                  active ? 'bg-gold-dim text-gold font-medium' : 'text-text-2 hover:bg-surface-2 hover:text-text'
                )}
                title={item.label}
              >
                {active && <span className="absolute left-0 top-[18%] bottom-[18%] w-0.5 bg-gold rounded" />}
                <Icon name={item.icon} size={18} />
                {!collapsed && <span>{item.label}</span>}
              </button>
            )
          })}
        </nav>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 px-3 py-2.5 border-t border-line text-muted text-sm hover:text-text cursor-pointer"
        >
          <Icon name="chevron" size={15} style={{ transform: collapsed ? 'none' : 'rotate(180deg)' }} />
          {!collapsed && <span>Recolher</span>}
        </button>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 bg-bg">
        <header className="flex items-center gap-3.5 px-6 py-3.5 border-b border-line bg-surface">
          <div className="flex p-0.5 border border-line-2 rounded-3xl bg-surface-2 gap-0.5">
            <button
              onClick={() => navigate('/financeiro')}
              className={cn(
                'px-4 py-1.5 rounded-2xl text-sm font-medium transition-colors cursor-pointer',
                isFin ? 'bg-gold text-[#1A1407]' : 'text-muted'
              )}
            >
              Financeiro
            </button>
            <button
              onClick={() => navigate('/estoque')}
              className={cn(
                'px-4 py-1.5 rounded-2xl text-sm font-medium transition-colors cursor-pointer',
                !isFin ? 'bg-gold text-[#1A1407]' : 'text-muted'
              )}
            >
              Estoque
            </button>
          </div>
          <div className="flex-1" />
          <button className="w-9 h-9 flex items-center justify-center rounded-lg border border-line bg-surface-2 text-text-2 hover:text-text cursor-pointer">
            <Icon name="bell" size={18} />
          </button>
          <span className="w-9 h-9 rounded-full border border-gold-line text-gold flex items-center justify-center text-xs font-semibold">
            AD
          </span>
        </header>

        <div className="flex-1 overflow-auto p-7">
          <div className="max-w-[1200px] mx-auto">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  )
}
