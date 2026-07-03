import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/shared/Icon'
import { cn, formatBRL } from '@/lib/utils'
import {
  calcularGiroDecant,
  calcularGiroProduto,
  ordenarGiro,
  resumoGiro,
  type MovimentacaoGiro,
  type OrdemGiro,
} from '@/lib/giro'

const PRESETS_DIAS = [30, 60, 90, 180]
const DIA_MS = 86_400_000

interface ProdutoRow {
  id: string
  nome: string
  estoque_atual: number | null
  custo_medio: number | null
}

interface MovimentacaoRow extends MovimentacaoGiro {
  produto_id: string
}

interface FrascoRow {
  id: string
  produto_id: string
  ml_restante: number | null
  status: string
  produtos: { nome: string } | null
}

interface DecantRow {
  frasco_id: string
  ml: number
}

interface LinhaProduto {
  id: string
  nome: string
  estoqueAtual: number
  custoMedio: number
  saidas: number
  entradas: number
  estoqueMedio: number
  giro: number | null
  coberturaDias: number | null
  parado: boolean
}

interface LinhaDecant {
  id: string
  nome: string
  mlRestante: number
  mlConsumido: number
  coberturaDias: number | null
  parado: boolean
}

function trackMouse(e: React.MouseEvent<HTMLElement>) {
  const el = e.currentTarget
  const rect = el.getBoundingClientRect()
  el.style.setProperty('--mx', `${e.clientX - rect.left}px`)
  el.style.setProperty('--my', `${e.clientY - rect.top}px`)
}

function formatGiro(giro: number | null) {
  return giro === null ? '—' : `${giro.toFixed(2)}x`
}

function formatCobertura(cobertura: number | null) {
  return cobertura === null ? '∞' : `${Math.round(cobertura)} d`
}

function StatCard({ label, icon, valor }: { label: string; icon: string; valor: string }) {
  return (
    <div
      onMouseMove={trackMouse}
      className="glow-card gold-hairline bg-surface border border-line rounded-xl p-5 flex flex-col gap-3 hover:-translate-y-1"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[0.62rem] text-muted uppercase tracking-[.14em]">{label}</span>
        <span className="w-8 h-8 rounded-lg border border-line bg-surface-2 flex items-center justify-center text-gold/70">
          <Icon name={icon} size={15} />
        </span>
      </div>
      <span className="text-3xl font-light tabular-nums tracking-tight">{valor}</span>
      <span className="h-px w-full bg-gradient-to-r from-gold-line via-line to-transparent" />
    </div>
  )
}

function ParadoBadge() {
  return (
    <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-warn/15 text-warn">
      Parado
    </span>
  )
}

function SortButton({
  children,
  onClick,
}: {
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-end gap-1 text-text-2 hover:text-gold transition-colors cursor-pointer"
    >
      {children}
      <Icon name="chevron" size={12} className="rotate-90" />
    </button>
  )
}

export function EstRelatorios() {
  const [dias, setDias] = useState(90)
  const [diasInput, setDiasInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [ordem, setOrdem] = useState<OrdemGiro>('giro_desc')
  const [soParados, setSoParados] = useState(false)
  const [produtos, setProdutos] = useState<ProdutoRow[]>([])
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoRow[]>([])
  const [frascos, setFrascos] = useState<FrascoRow[]>([])
  const [decants, setDecants] = useState<DecantRow[]>([])

  const carregarDados = useCallback(async () => {
    setLoading(true)
    setErro(null)

    const inicio = new Date(Date.now() - dias * DIA_MS).toISOString()
    const [produtosRes, movimentacoesRes, frascosRes, decantsRes] = await Promise.all([
      supabase.from('produtos').select('id, nome, estoque_atual, custo_medio'),
      supabase.from('movimentacoes').select('produto_id, tipo, quantidade').gte('created_at', inicio),
      supabase.from('frascos_abertos').select('id, produto_id, ml_restante, status, produtos(nome)').eq('status', 'ativo'),
      supabase.from('decants').select('frasco_id, ml').gte('created_at', inicio),
    ])

    const erroFetch = produtosRes.error || movimentacoesRes.error || frascosRes.error || decantsRes.error
    if (erroFetch) {
      setErro(erroFetch.message)
      console.error('Erro ao carregar relatório de giro:', erroFetch)
    }

    setProdutos((produtosRes.data as ProdutoRow[]) || [])
    setMovimentacoes((movimentacoesRes.data as MovimentacaoRow[]) || [])
    setFrascos((frascosRes.data as unknown as FrascoRow[]) || [])
    setDecants((decantsRes.data as DecantRow[]) || [])
    setLoading(false)
  }, [dias])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  const linhasProduto = useMemo<LinhaProduto[]>(() => {
    const movsPorProduto = new Map<string, MovimentacaoRow[]>()
    for (const mov of movimentacoes) {
      const lista = movsPorProduto.get(mov.produto_id) ?? []
      lista.push(mov)
      movsPorProduto.set(mov.produto_id, lista)
    }

    return produtos.map((produto) => {
      const giro = calcularGiroProduto(produto.estoque_atual ?? 0, movsPorProduto.get(produto.id) ?? [], dias)

      return {
        id: produto.id,
        nome: produto.nome,
        estoqueAtual: produto.estoque_atual ?? 0,
        custoMedio: produto.custo_medio ?? 0,
        saidas: giro.saidas,
        entradas: giro.entradas,
        estoqueMedio: giro.estoqueMedio,
        giro: giro.giro,
        coberturaDias: giro.coberturaDias,
        parado: giro.parado,
      }
    })
  }, [dias, movimentacoes, produtos])

  const linhasDecant = useMemo<LinhaDecant[]>(() => {
    const consumoPorFrasco = new Map<string, number>()
    for (const decant of decants) {
      consumoPorFrasco.set(decant.frasco_id, (consumoPorFrasco.get(decant.frasco_id) ?? 0) + decant.ml)
    }

    return frascos.map((frasco) => {
      const mlConsumido = consumoPorFrasco.get(frasco.id) ?? 0
      const giro = calcularGiroDecant(frasco.ml_restante ?? 0, mlConsumido, dias)

      return {
        id: frasco.id,
        nome: frasco.produtos?.nome ?? 'Sem produto',
        mlRestante: frasco.ml_restante ?? 0,
        mlConsumido,
        coberturaDias: giro.coberturaDias,
        parado: giro.parado,
      }
    })
  }, [decants, dias, frascos])

  const resumo = resumoGiro(linhasProduto)
  const produtosFiltrados = soParados ? linhasProduto.filter((linha) => linha.parado) : linhasProduto
  const produtosVisiveis = ordenarGiro(produtosFiltrados, ordem)
  const cardValor = (valor: string) => (loading ? '—' : valor)

  function aplicarDiasInput() {
    const proximo = Number.parseInt(diasInput, 10)
    if (Number.isNaN(proximo) || proximo <= 0) return
    setDias(proximo)
  }

  function alternarOrdem(desc: OrdemGiro, asc: OrdemGiro) {
    setOrdem((atual) => (atual === desc ? asc : desc))
  }

  return (
    <div className="flex flex-col gap-6 stagger">
      <div>
        <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold flex items-center gap-2">
          <span className="w-1 h-1 bg-gold rotate-45" />
          Estoque / Relatório de giro
        </p>
        <h1 className="text-4xl tracking-tight mt-1.5">Relatório de giro</h1>
        <p className="text-muted text-sm mt-1">Velocidade de giro, cobertura e estoque parado no período</p>
      </div>

      {erro && (
        <div className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">
          Erro ao carregar dados: {erro}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-1 p-0.5 border border-line-2 rounded-xl bg-surface-2">
          {PRESETS_DIAS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setDias(preset)
                setDiasInput('')
              }}
              aria-pressed={dias === preset}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                dias === preset ? 'bg-gold text-[#1A1407]' : 'text-muted hover:text-text'
              )}
            >
              {preset} dias
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={diasInput}
            onChange={(e) => setDiasInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') aplicarDiasInput()
            }}
            placeholder="N dias"
            aria-label="Período personalizado em dias"
            className="w-24 px-3 py-1.5 rounded-lg border border-line bg-surface-2 text-text text-sm placeholder:text-faint transition-colors focus:outline-none focus:border-gold/60"
          />
          <button
            type="button"
            onClick={aplicarDiasInput}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-line bg-surface-2 text-text hover:border-gold-line cursor-pointer transition-colors"
          >
            Aplicar
          </button>
        </div>

        <span className="text-xs text-muted">Período atual: últimos {dias} dias</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <StatCard label="Giro médio" icon="swap" valor={cardValor(formatGiro(resumo.giroMedio))} />
        <StatCard label="Produtos parados" icon="warn" valor={cardValor(String(resumo.qtdParados))} />
        <StatCard label="Valor encalhado" icon="box" valor={cardValor(formatBRL(resumo.valorEncalhado))} />
        <StatCard label="Cobertura média" icon="dashboard" valor={cardValor(formatCobertura(resumo.coberturaMedia))} />
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="font-mono text-[0.62rem] uppercase tracking-[.14em] text-faint">Frascos cheios</p>
            <p className="text-muted text-xs mt-1">Giro calculado por unidade em estoque</p>
          </div>
          <label className="flex items-center gap-2 text-xs text-text-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={soParados}
              onChange={(e) => setSoParados(e.target.checked)}
              className="accent-gold"
            />
            Só parados
          </label>
        </div>

        <div className="border border-line rounded-xl overflow-hidden bg-surface/40">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-line bg-surface">
                <th className="text-left px-4 py-3 font-medium">Produto</th>
                <th className="text-right px-4 py-3 font-medium">Estoque</th>
                <th className="text-right px-4 py-3 font-medium">
                  <SortButton onClick={() => setOrdem('saidas_desc')}>Saídas</SortButton>
                </th>
                <th className="text-right px-4 py-3 font-medium">
                  <SortButton onClick={() => alternarOrdem('giro_desc', 'giro_asc')}>Giro</SortButton>
                </th>
                <th className="text-right px-4 py-3 font-medium">
                  <SortButton onClick={() => alternarOrdem('cobertura_desc', 'cobertura_asc')}>
                    Cobertura
                  </SortButton>
                </th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">Carregando...</td>
                </tr>
              ) : produtosVisiveis.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    {soParados ? 'Nenhum produto parado no período' : 'Nenhum produto cadastrado'}
                  </td>
                </tr>
              ) : (
                produtosVisiveis.map((linha) => (
                  <tr key={linha.id} className="border-b border-line last:border-0 hover:bg-surface-2/50">
                    <td className="px-4 py-3 font-medium">{linha.nome}</td>
                    <td className="px-4 py-3 text-right font-mono">{linha.estoqueAtual}</td>
                    <td className="px-4 py-3 text-right font-mono">{linha.saidas}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatGiro(linha.giro)}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatCobertura(linha.coberturaDias)}</td>
                    <td className="px-4 py-3">{linha.parado && <ParadoBadge />}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-medium tracking-tight">Decants</h2>
          <p className="text-muted text-xs mt-1">Consumo de ml dos frascos abertos no período</p>
        </div>

        <div className="border border-line rounded-xl overflow-hidden bg-surface/40">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-line bg-surface">
                <th className="text-left px-4 py-3 font-medium">Produto</th>
                <th className="text-right px-4 py-3 font-medium">Ml restante</th>
                <th className="text-right px-4 py-3 font-medium">Ml consumidos</th>
                <th className="text-right px-4 py-3 font-medium">Cobertura</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">Carregando...</td>
                </tr>
              ) : linhasDecant.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">Nenhum frasco aberto</td>
                </tr>
              ) : (
                linhasDecant.map((linha) => (
                  <tr key={linha.id} className="border-b border-line last:border-0 hover:bg-surface-2/50">
                    <td className="px-4 py-3 font-medium">{linha.nome}</td>
                    <td className="px-4 py-3 text-right font-mono">{linha.mlRestante}</td>
                    <td className="px-4 py-3 text-right font-mono">{linha.mlConsumido}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatCobertura(linha.coberturaDias)}</td>
                    <td className="px-4 py-3">{linha.parado && <ParadoBadge />}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      </section>
    </div>
  )
}
