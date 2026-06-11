import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { DIVERGENCIA_TIPOS, type DivergenciaTipo } from '@/lib/pedidos'

interface DivergenciaRow {
  id: string
  tipo: DivergenciaTipo
  qtd_pedida: number
  qtd_recebida: number
  observacao: string | null
  created_at: string
  pedidos: { numero: number } | null
  fornecedores: { nome: string } | null
  pedido_itens: { produtos: { nome: string } | null } | null
}

const TIPO_LABEL = Object.fromEntries(DIVERGENCIA_TIPOS.map(t => [t.value, t.label]))

export function EstDivergencias() {
  const [divergencias, setDivergencias] = useState<DivergenciaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroFornecedor, setFiltroFornecedor] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')

  useEffect(() => {
    supabase
      .from('divergencias')
      .select('*, pedidos(numero), fornecedores(nome), pedido_itens(produtos(nome))')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('Erro ao carregar divergências:', error)
        setDivergencias(((data as unknown) as DivergenciaRow[] | null) || [])
        setLoading(false)
      })
  }, [])

  const fornecedores = [...new Set(divergencias.map(d => d.fornecedores?.nome).filter(Boolean))] as string[]

  const filtradas = divergencias.filter(d => {
    if (filtroFornecedor && d.fornecedores?.nome !== filtroFornecedor) return false
    if (filtroTipo && d.tipo !== filtroTipo) return false
    return true
  })

  // resumo: divergências por fornecedor
  const resumo = fornecedores
    .map(nome => ({ nome, total: divergencias.filter(d => d.fornecedores?.nome === nome).length }))
    .sort((a, b) => b.total - a.total)

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold">Estoque / Qualidade</p>
        <h1 className="text-3xl font-medium tracking-tight mt-1">Divergências</h1>
        <p className="text-muted text-sm mt-1">Histórico de diferenças entre pedido e recebimento</p>
      </div>

      {resumo.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {resumo.map(r => (
            <div key={r.nome} className="bg-surface border border-line rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-sm font-medium">{r.nome}</span>
              <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-warn/15 text-warn">
                {r.total} divergência{r.total > 1 ? 's' : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2.5">
        <select
          value={filtroFornecedor}
          onChange={(e) => setFiltroFornecedor(e.target.value)}
          className="px-3.5 py-2.5 rounded-lg border border-line bg-surface text-text text-sm cursor-pointer focus:outline-none focus:border-gold/60"
          aria-label="Filtrar por fornecedor"
        >
          <option value="">Todos os fornecedores</option>
          {fornecedores.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          className="px-3.5 py-2.5 rounded-lg border border-line bg-surface text-text text-sm cursor-pointer focus:outline-none focus:border-gold/60"
          aria-label="Filtrar por tipo"
        >
          <option value="">Todos os tipos</option>
          {DIVERGENCIA_TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      <div className="border border-line rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface">
              <th className="text-left px-4 py-3 text-text-2 font-medium">Data</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Pedido</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Fornecedor</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Produto</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Tipo</th>
              <th className="text-right px-4 py-3 text-text-2 font-medium">Pedida → Recebida</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Observação</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">Carregando...</td></tr>
            ) : filtradas.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">Nenhuma divergência registrada</td></tr>
            ) : (
              filtradas.map((d) => (
                <tr key={d.id} className="border-b border-line last:border-0 hover:bg-surface-2/50">
                  <td className="px-4 py-3 text-text-2 text-xs">{formatDate(d.created_at)}</td>
                  <td className="px-4 py-3 font-mono text-muted">#{d.pedidos?.numero ?? '—'}</td>
                  <td className="px-4 py-3 font-medium">{d.fornecedores?.nome || '—'}</td>
                  <td className="px-4 py-3">{d.pedido_itens?.produtos?.nome || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-warn/15 text-warn">
                      {TIPO_LABEL[d.tipo] || d.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{d.qtd_pedida} → {d.qtd_recebida}</td>
                  <td className="px-4 py-3 text-text-2">{d.observacao || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
