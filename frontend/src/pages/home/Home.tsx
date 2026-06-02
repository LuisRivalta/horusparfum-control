import { useNavigate } from 'react-router-dom'
import { Mark } from '@/components/shared/Mark'
import { Icon } from '@/components/shared/Icon'

export function Home() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex items-center justify-center p-12 bg-[radial-gradient(120%_90%_at_50%_-10%,rgba(201,168,76,0.06),transparent_60%)]">
      <div className="w-full max-w-[860px] flex flex-col gap-8">
        <div className="flex flex-col items-center gap-4">
          <Mark size={64} />
          <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold mt-1">
            Painel administrativo · uso interno
          </p>
        </div>

        <div className="flex items-center gap-3.5 mx-auto max-w-[360px] w-full">
          <span className="flex-1 h-px bg-gradient-to-r from-transparent via-gold-line to-transparent" />
          <i className="w-1.5 h-1.5 border border-gold rotate-45" />
          <span className="flex-1 h-px bg-gradient-to-r from-transparent via-gold-line to-transparent" />
        </div>

        <p className="text-center text-text-2 text-base font-light">Selecione uma área para gerenciar</p>

        <div className="grid grid-cols-2 gap-5">
          <button
            onClick={() => navigate('/financeiro')}
            className="group relative cursor-pointer text-left bg-surface border border-line rounded-2xl p-7 flex flex-col gap-3.5 items-start min-h-[220px] transition hover:border-gold-line hover:-translate-y-0.5 hover:bg-surface-2"
          >
            <span className="w-13 h-13 rounded-xl border border-gold-line bg-gold-dim flex items-center justify-center">
              <Icon name="report" size={26} gold />
            </span>
            <span className="text-2xl font-medium font-serif tracking-wide">Financeiro</span>
            <span className="text-muted text-sm leading-relaxed font-light">
              Entradas e saídas, saldo, contas a pagar/receber, metas e relatórios.
            </span>
            <span className="mt-auto flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[.08em] text-gold">
              Acessar <Icon name="chevron" size={14} gold />
            </span>
          </button>

          <button
            onClick={() => navigate('/estoque')}
            className="group relative cursor-pointer text-left bg-surface border border-line rounded-2xl p-7 flex flex-col gap-3.5 items-start min-h-[220px] transition hover:border-gold-line hover:-translate-y-0.5 hover:bg-surface-2"
          >
            <span className="w-13 h-13 rounded-xl border border-gold-line bg-gold-dim flex items-center justify-center">
              <Icon name="box" size={26} gold />
            </span>
            <span className="text-2xl font-medium font-serif tracking-wide">Estoque</span>
            <span className="text-muted text-sm leading-relaxed font-light">
              Produtos, movimentações, categorias, fornecedores e alertas.
            </span>
            <span className="mt-auto flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[.08em] text-gold">
              Acessar <Icon name="chevron" size={14} gold />
            </span>
          </button>
        </div>

        <p className="text-center font-mono text-xs text-faint">
          As duas áreas são independentes — não há vínculo entre elas.
        </p>
      </div>
    </div>
  )
}
