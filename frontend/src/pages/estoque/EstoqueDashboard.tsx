import { useMemo } from 'react'
import { Icon } from '@/components/shared/Icon'
import { formatBRL } from '@/lib/utils'
import {
  agruparEstoque,
  resumoEstoque,
  topProdutosPorValor,
  type GrupoEstoque,
  type ProdutoEstoque,
} from '@/lib/estoqueDashboard'

const TOP_PRODUTOS = 5

interface Nomeado {
  id: string
  nome: string
}

interface Props {
  produtos: ProdutoEstoque[]
  categorias: Nomeado[]
  marcas: Nomeado[]
  loading: boolean
}

function trackMouse(e: React.MouseEvent<HTMLElement>) {
  const el = e.currentTarget
  const rect = el.getBoundingClientRect()
  el.style.setProperty('--mx', `${e.clientX - rect.left}px`)
  el.style.setProperty('--my', `${e.clientY - rect.top}px`)
}

function formatPct(participacao: number) {
  return `${(participacao * 100).toFixed(1)}%`
}

function StatCard({
  label,
  icon,
  valor,
  nota,
  alerta,
}: {
  label: string
  icon: string
  valor: string
  nota?: string
  alerta?: boolean
}) {
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
      <span className="text-3xl font-light tracking-tight">{valor}</span>
      <span className="h-px w-full bg-gradient-to-r from-gold-line via-line to-transparent" />
      <span className={`text-xs ${alerta ? 'text-warn' : 'text-muted'} min-h-[1rem]`}>{nota ?? ''}</span>
    </div>
  )
}

/** Barra de participação: trilha e preenchimento no mesmo tom, valor sempre rotulado ao lado. */
function BarraParticipacao({ participacao }: { participacao: number }) {
  return (
    <span className="inline-flex items-center gap-2 w-full">
      <span className="h-1.5 flex-1 min-w-[40px] rounded-[3px] bg-gold/15 overflow-hidden">
        <span
          className="block h-full rounded-r-[3px] bg-gold"
          style={{ width: `${Math.max(participacao * 100, participacao > 0 ? 2 : 0)}%` }}
        />
      </span>
      <span className="font-mono tabular-nums text-xs text-muted w-12 text-right">
        {formatPct(participacao)}
      </span>
    </span>
  )
}

function TabelaGrupos({
  titulo,
  descricao,
  rotuloColuna,
  grupos,
}: {
  titulo: string
  descricao: string
  rotuloColuna: string
  grupos: GrupoEstoque[]
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-medium tracking-tight">{titulo}</h2>
        <p className="text-muted text-xs mt-1">{descricao}</p>
      </div>

      <div className="border border-line rounded-xl overflow-hidden bg-surface/40">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line bg-surface">
                <th className="text-left px-4 py-3 font-medium">{rotuloColuna}</th>
                <th className="text-right px-4 py-3 font-medium">Produtos</th>
                <th className="text-right px-4 py-3 font-medium">Unidades</th>
                <th className="text-right px-4 py-3 font-medium">Valor</th>
                <th className="text-left px-4 py-3 font-medium w-[28%]">% do valor</th>
              </tr>
            </thead>
            <tbody>
              {grupos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">
                    Nenhum produto em estoque
                  </td>
                </tr>
              ) : (
                grupos.map((grupo) => (
                  <tr
                    key={grupo.nome}
                    className="border-b border-line last:border-0 hover:bg-surface-2/50"
                  >
                    <td className="px-4 py-3 font-medium">{grupo.nome}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{grupo.produtos}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{grupo.unidades}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{formatBRL(grupo.valor)}</td>
                    <td className="px-4 py-3">
                      <BarraParticipacao participacao={grupo.participacao} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

export function EstoqueDashboard({ produtos, categorias, marcas, loading }: Props) {
  const resumo = useMemo(() => resumoEstoque(produtos), [produtos])

  const porCategoria = useMemo(
    () =>
      agruparEstoque(
        produtos,
        (p) => p.categoria_id,
        new Map(categorias.map((c) => [c.id, c.nome])),
        'Sem categoria'
      ),
    [categorias, produtos]
  )

  const porMarca = useMemo(
    () =>
      agruparEstoque(
        produtos,
        (p) => p.marca_id,
        new Map(marcas.map((m) => [m.id, m.nome])),
        'Sem marca'
      ),
    [marcas, produtos]
  )

  const topProdutos = useMemo(() => topProdutosPorValor(produtos, TOP_PRODUTOS), [produtos])

  if (loading) {
    return <div className="py-12 text-center text-muted">Carregando...</div>
  }

  const atencao = resumo.criticos + resumo.baixos

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <StatCard
          label="Valor em estoque"
          icon="box"
          valor={formatBRL(resumo.valorTotal)}
          nota={
            resumo.semCusto > 0
              ? `${resumo.semCusto} produto${resumo.semCusto !== 1 ? 's' : ''} sem custo médio`
              : 'Todos os produtos com custo médio'
          }
          alerta={resumo.semCusto > 0}
        />
        <StatCard
          label="Produtos em estoque"
          icon="grid"
          valor={String(resumo.produtos)}
          nota={`${resumo.unidades} unidade${resumo.unidades !== 1 ? 's' : ''} no total`}
        />
        <StatCard
          label="Precisam de atenção"
          icon="warn"
          valor={String(atencao)}
          nota={`${resumo.criticos} crítico${resumo.criticos !== 1 ? 's' : ''} · ${resumo.baixos} baixo${resumo.baixos !== 1 ? 's' : ''}`}
          alerta={resumo.criticos > 0}
        />
        <StatCard
          label="Custo médio por unidade"
          icon="report"
          valor={resumo.custoMedioUnidade === null ? '—' : formatBRL(resumo.custoMedioUnidade)}
          nota={`${resumo.ok} produto${resumo.ok !== 1 ? 's' : ''} com estoque saudável`}
        />
      </div>

      <TabelaGrupos
        titulo="Por categoria"
        descricao="Produtos, unidades e valor em estoque de cada categoria"
        rotuloColuna="Categoria"
        grupos={porCategoria}
      />

      <TabelaGrupos
        titulo="Por marca"
        descricao="Mesma leitura agrupada por marca do produto"
        rotuloColuna="Marca"
        grupos={porMarca}
      />

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-medium tracking-tight">Onde o valor está concentrado</h2>
          <p className="text-muted text-xs mt-1">
            Top {TOP_PRODUTOS} produtos por valor em estoque, em % do estoque total
          </p>
        </div>

        <div className="border border-line rounded-xl overflow-hidden bg-surface/40">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line bg-surface">
                  <th className="text-left px-4 py-3 font-medium">Produto</th>
                  <th className="text-right px-4 py-3 font-medium">Estoque</th>
                  <th className="text-right px-4 py-3 font-medium">Valor</th>
                  <th className="text-left px-4 py-3 font-medium w-[28%]">% do valor</th>
                </tr>
              </thead>
              <tbody>
                {topProdutos.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted">
                      Nenhum produto com custo médio cadastrado
                    </td>
                  </tr>
                ) : (
                  topProdutos.map((produto) => (
                    <tr
                      key={produto.id}
                      className="border-b border-line last:border-0 hover:bg-surface-2/50"
                    >
                      <td className="px-4 py-3 font-medium">{produto.nome}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{produto.estoqueAtual}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{formatBRL(produto.valor)}</td>
                      <td className="px-4 py-3">
                        <BarraParticipacao participacao={produto.participacao} />
                      </td>
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
