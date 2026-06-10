import { useNavigate } from 'react-router-dom'
import { Mark } from '@/components/shared/Mark'
import { Icon } from '@/components/shared/Icon'
import ColorBends from '@/components/shared/ColorBends'

function trackMouse(e: React.MouseEvent<HTMLElement>) {
  const el = e.currentTarget
  const rect = el.getBoundingClientRect()
  el.style.setProperty('--mx', `${e.clientX - rect.left}px`)
  el.style.setProperty('--my', `${e.clientY - rect.top}px`)
}

const AREAS = [
  {
    path: '/financeiro',
    icon: 'report',
    title: 'Financeiro',
    desc: 'Entradas e saídas, saldo, contas a pagar/receber, metas e relatórios.',
  },
  {
    path: '/estoque',
    icon: 'box',
    title: 'Estoque',
    desc: 'Produtos, movimentações, categorias, fornecedores e alertas.',
  },
] as const

export function Home() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen relative flex items-center justify-center p-6 sm:p-12 overflow-hidden">
      {/* Atmosfera Three.js ao fundo, bem sutil */}
      <div className="absolute inset-0 z-0 opacity-25">
        <ColorBends
          colors={['#C9A84C', '#8A6D2F', '#1A1A19']}
          rotation={115}
          speed={0.08}
          scale={1.8}
          frequency={1}
          warpStrength={1}
          mouseInfluence={0.4}
          noise={0.1}
          parallax={0.3}
          iterations={1}
          intensity={0.9}
          bandWidth={8}
          transparent={false}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      {/* Véu para legibilidade + vinheta dourada no topo */}
      <div className="absolute inset-0 z-0 bg-bg/70" />
      <div className="absolute inset-0 z-0 bg-[radial-gradient(120%_90%_at_50%_-10%,rgba(201,168,76,0.08),transparent_60%)]" />

      <div className="w-full max-w-[880px] flex flex-col gap-9 relative z-10 stagger">
        <div className="flex flex-col items-center gap-4">
          <Mark size={72} />
          <p className="font-mono text-[0.66rem] uppercase tracking-[.32em] text-gold mt-1">
            Painel administrativo · uso interno
          </p>
        </div>

        <div className="ornament-divider mx-auto max-w-[380px] w-full">
          <i className="w-1.5 h-1.5 border border-gold rotate-45 shrink-0" />
          <i className="w-2.5 h-2.5 border border-gold rotate-45 shrink-0 bg-gold-dim" />
          <i className="w-1.5 h-1.5 border border-gold rotate-45 shrink-0" />
        </div>

        <p className="text-center text-text-2 text-xl sm:text-2xl font-serif italic font-medium tracking-wide">
          Selecione uma área para gerenciar
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {AREAS.map((area) => (
            <button
              key={area.path}
              onClick={() => navigate(area.path)}
              onMouseMove={trackMouse}
              className="glow-card gold-hairline group relative cursor-pointer text-left bg-surface/80 backdrop-blur-sm border border-line rounded-2xl p-7 flex flex-col gap-3.5 items-start min-h-[200px] sm:min-h-[230px] hover:-translate-y-1.5"
            >
              {/* Cantos ornamentais */}
              <span className="absolute top-3 right-3 w-4 h-4 border-t border-r border-gold-line opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-tr" />
              <span className="absolute bottom-3 left-3 w-4 h-4 border-b border-l border-gold-line opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-bl" />

              <span className="w-13 h-13 rounded-xl border border-gold-line bg-gold-dim flex items-center justify-center transition-all duration-300 group-hover:shadow-[0_0_24px_rgba(201,168,76,0.3)] group-hover:scale-105">
                <Icon name={area.icon} size={26} gold />
              </span>
              <span className="text-3xl font-medium font-serif tracking-wide transition-colors duration-300 group-hover:text-gold-bright">
                {area.title}
              </span>
              <span className="text-muted text-sm leading-relaxed font-light">
                {area.desc}
              </span>
              <span className="mt-auto flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[.08em] text-gold">
                Acessar
                <span className="transition-transform duration-300 group-hover:translate-x-1.5">
                  <Icon name="chevron" size={14} gold />
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
