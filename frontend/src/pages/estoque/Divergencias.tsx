import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { DIVERGENCIA_TIPOS, type DivergenciaTipo } from '@/lib/pedidos'
import { Select } from '@/components/shared/FormControls'

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
      {resumo.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[0.62rem] uppercase tracking-[.14em] text-faint">Resumo geral por fornecedor</p>
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
        </div>
      )}

      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <Select
          aria-label="Filtrar por fornecedor"
          options={[{ value: '', label: 'Todos os fornecedores' }, ...fornecedores.map((f) => ({ value: f, label: f }))]}
          value={filtroFornecedor}
          onChange={(e) => setFiltroFornecedor(e.target.value)}
        />
        <Select
          aria-label="Filtrar por tipo"
          options={[{ value: '', label: 'Todos os tipos' }, ...DIVERGENCIA_TIPOS]}
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
        />
      </div>

      <div className="border border-line rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
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
    </div>
  )
}
