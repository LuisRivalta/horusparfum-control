import { useState, useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Mark } from '@/components/shared/Mark'
import { Icon } from '@/components/shared/Icon'
import { DayNightSwitch } from '@/components/shared/DayNightSwitch'
import { UserMenu } from '@/components/shared/UserMenu'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'

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
  { id: 'pedidos', label: 'Pedidos', icon: 'swap', path: '/estoque/pedidos' },
  { id: 'divergencias', label: 'Divergências', icon: 'warn', path: '/estoque/divergencias' },
  { id: 'categorias', label: 'Categorias', icon: 'grid', path: '/estoque/categorias' },
  { id: 'fornecedores', label: 'Fornecedores', icon: 'supplier', path: '/estoque/fornecedores' },
  { id: 'alertas', label: 'Alertas', icon: 'alert', path: '/estoque/alertas' },
  { id: 'relatorios', label: 'Relatório de giro', icon: 'report', path: '/estoque/relatorios' },
]

export function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()

  const isFin = location.pathname.startsWith('/financeiro')
  const nav = isFin ? FIN_NAV : EST_NAV

  // Fecha o drawer mobile ao navegar
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  const initials = user?.email
    ? user.email.substring(0, 2).toUpperCase()
    : '??'

  const sidebarContent = (
    <>
      <button
        onClick={() => navigate('/')}
        className="logo-hover flex items-center justify-center px-3 py-4 border-b border-line cursor-pointer"
        title="Início"
      >
        <Mark size={collapsed ? 44 : 75} />
      </button>

      <div className="px-4 pt-4 pb-1.5 font-mono text-[0.6rem] uppercase tracking-[.24em] text-faint h-8">
        {!collapsed && (
          <span className="flex items-center gap-2">
            <span className="w-1 h-1 bg-gold/60 rotate-45 shrink-0" />
            {isFin ? 'Financeiro' : 'Estoque'}
          </span>
        )}
      </div>

      <nav className="flex flex-col gap-0.5 flex-1 px-2">
        {nav.map((item) => {
          const active = location.pathname === item.path
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              className={cn(
                'group/nav relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer whitespace-nowrap transition-all duration-200',
                active
                  ? 'bg-gold-dim text-gold font-medium shadow-[inset_0_0_0_1px_var(--color-gold-line)]'
                  : 'text-text-2 hover:bg-surface-2 hover:text-text hover:translate-x-0.5'
              )}
              title={item.label}
            >
              {active && (
                <span className="absolute left-0 top-[22%] bottom-[22%] w-[3px] bg-gradient-to-b from-gold-bright via-gold to-gold/40 rounded-full" />
              )}
              <span className={cn(
                'transition-transform duration-200',
                !active && 'group-hover/nav:scale-110 group-hover/nav:text-gold'
              )}>
                <Icon name={item.icon} size={18} />
              </span>
              {!collapsed && <span>{item.label}</span>}
            </button>
          )
        })}
      </nav>

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hidden lg:flex items-center gap-2 px-4 py-3 border-t border-line text-muted text-sm hover:text-gold cursor-pointer transition-colors"
      >
        <Icon
          name="chevron"
          size={15}
          style={{ transform: collapsed ? 'none' : 'rotate(180deg)', transition: 'transform 0.3s ease' }}
        />
        {!collapsed && <span>Recolher</span>}
      </button>
    </>
  )

  return (
    <div className="flex h-screen">
      {/* Sidebar desktop */}
      <aside
        className={cn(
          'hidden lg:flex flex-col border-r border-line bg-surface transition-[width] duration-300',
          collapsed ? 'w-[74px]' : 'w-[236px]'
        )}
      >
        {sidebarContent}
      </aside>

      {/* Drawer mobile */}
      <div
        className={cn(
          'lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300',
          mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={() => setMobileOpen(false)}
      />
      <aside
        className={cn(
          'lg:hidden fixed inset-y-0 left-0 z-50 flex flex-col w-[260px] border-r border-line bg-surface transition-transform duration-300 ease-out',
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        )}
      >
        {sidebarContent}
      </aside>

      <div className="flex-1 flex flex-col min-w-0 bg-bg relative">
        {/* Atmosfera dourada sutil no topo da área de conteúdo */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(90%_100%_at_50%_-30%,rgba(201,168,76,0.05),transparent_70%)]" />

        <header className="sticky top-0 z-30 flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-line bg-surface/85 backdrop-blur-xl">
          {/* Hamburger mobile */}
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden w-9 h-9 flex flex-col items-center justify-center gap-[5px] rounded-lg border border-line bg-surface-2 cursor-pointer group/burger"
            aria-label="Abrir menu"
          >
            <span className="w-4 h-px bg-text-2 transition-all group-hover/burger:bg-gold group-hover/burger:w-5" />
            <span className="w-5 h-px bg-text-2 transition-colors group-hover/burger:bg-gold" />
            <span className="w-4 h-px bg-text-2 transition-all group-hover/burger:bg-gold group-hover/burger:w-5" />
          </button>

          <div className="flex p-0.5 border border-line-2 rounded-3xl bg-surface-2 gap-0.5 relative">
            {/* Indicador deslizante */}
            <span
              className={cn(
                'absolute top-0.5 bottom-0.5 rounded-2xl bg-gold shadow-[0_2px_12px_rgba(201,168,76,0.35)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                isFin ? 'left-0.5 right-1/2 mr-0' : 'left-1/2 right-0.5 ml-0'
              )}
            />
            <button
              onClick={() => navigate('/financeiro')}
              className={cn(
                'relative z-10 w-24 sm:w-28 py-1.5 rounded-2xl text-xs sm:text-sm font-medium transition-colors duration-300 cursor-pointer text-center',
                isFin ? 'text-[#1A1407]' : 'text-muted hover:text-text'
              )}
            >
              Financeiro
            </button>
            <button
              onClick={() => navigate('/estoque')}
              className={cn(
                'relative z-10 w-24 sm:w-28 py-1.5 rounded-2xl text-xs sm:text-sm font-medium transition-colors duration-300 cursor-pointer text-center',
                !isFin ? 'text-[#1A1407]' : 'text-muted hover:text-text'
              )}
            >
              Estoque
            </button>
          </div>

          <div className="flex-1" />

          <DayNightSwitch checked={theme === 'dark'} onChange={() => toggleTheme()} />
          <button className="hidden sm:flex w-9 h-9 items-center justify-center rounded-lg border border-line bg-surface-2 text-text-2 hover:text-gold hover:border-gold-line hover:shadow-[0_0_14px_rgba(201,168,76,0.18)] cursor-pointer transition-all">
            <Icon name="bell" size={18} />
          </button>
          <UserMenu initials={initials} userEmail={user?.email} onSignOut={signOut} />
        </header>

        <div className="flex-1 overflow-auto p-4 sm:p-7 relative">
          <div key={location.pathname} className="max-w-[1200px] mx-auto page-enter">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  )
}
