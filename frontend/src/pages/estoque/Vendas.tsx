import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/shared/Icon'
import { Button } from '@/components/shared/FormControls'
import { Modal } from '@/components/shared/Modal'
import { formatBRL } from '@/lib/utils'
import { NovaVendaModal } from './vendas/NovaVendaModal'
import { VendaDetalheModal } from './vendas/VendaDetalheModal'

export interface VendaRow {
  id: string
  numero: number
  status: 'concluida' | 'cancelada'
  data_venda: string
  total_bruto: number
  total_custo: number
  lucro_bruto: number
  canal_id: string
  canais: { nome: string } | null
  venda_itens: { id: string }[]
}

const STATUS_BADGE: Record<VendaRow['status'], { label: string; cls: string }> = {
  concluida: { label: 'Concluída', cls: 'bg-up/15 text-up' },
  cancelada: { label: 'Cancelada', cls: 'bg-line text-muted' },
}

function pct(roi: number | null): string {
  if (roi === null) return '—'
  return `${(roi * 100).toFixed(0)}%`
}

export function EstVendas() {
  const navigate = useNavigate()
  const [vendas, setVendas] = useState<VendaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [novoOpen, setNovoOpen] = useState(false)
  const [detalhe, setDetalhe] = useState<VendaRow | null>(null)
  const [cancelando, setCancelando] = useState<VendaRow | null>(null)
  const [cancelSubmitting, setCancelSubmitting] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('vendas')
      .select('id, numero, status, data_venda, total_bruto, total_custo, lucro_bruto, canal_id, canais(nome), venda_itens(id)')
      .order('created_at', { ascending: false })
    if (error) console.error('Erro ao carregar vendas:', error)
    setVendas((data as VendaRow[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  function formatDate(iso: string) {
    return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  async function confirmarCancelamento() {
    if (!cancelando || cancelSubmitting) return
    setCancelSubmitting(true)
    setErro(null)
    const { error } = await supabase.rpc('cancelar_venda', { p_venda_id: cancelando.id })
    setCancelSubmitting(false)
    if (error) { setErro(error.message); return }
    setCancelando(null)
    fetchData()
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold">Estoque / Vendas</p>
          <h1 className="text-3xl font-medium tracking-tight mt-1">Vendas</h1>
          <p className="text-muted text-sm mt-1">Registro de vendas com baixa de estoque e lançamento no caixa</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => navigate('/estoque/vendas/config')}>
            <Icon name="filter" size={16} />
            Canais e embalagens
          </Button>
          <Button onClick={() => setNovoOpen(true)}>
            <Icon name="plus" size={16} />
            Nova venda
          </Button>
        </div>
      </div>

      {erro && (
        <div className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{erro}</div>
      )}

      <div className="border border-line rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface">
              <th className="text-left px-4 py-3 text-text-2 font-medium">Nº</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Data</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Canal</th>
              <th className="text-right px-4 py-3 text-text-2 font-medium">Itens</th>
              <th className="text-right px-4 py-3 text-text-2 font-medium">Bruto</th>
              <th className="text-right px-4 py-3 text-text-2 font-medium">Lucro</th>
              <th className="text-right px-4 py-3 text-text-2 font-medium">ROI</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-muted">Carregando...</td></tr>
            ) : vendas.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-muted">Nenhuma venda registrada</td></tr>
            ) : (
              vendas.map((v) => {
                const badge = STATUS_BADGE[v.status]
                const roiV = v.total_custo > 0 ? v.lucro_bruto / v.total_custo : null
                return (
                  <tr
                    key={v.id}
                    className="border-b border-line last:border-0 hover:bg-surface-2/50 cursor-pointer"
                    onClick={() => setDetalhe(v)}
                  >
                    <td className="px-4 py-3 font-mono text-muted">#{v.numero}</td>
                    <td className="px-4 py-3 text-text-2 text-xs">{formatDate(v.data_venda)}</td>
                    <td className="px-4 py-3 font-medium">{v.canais?.nome || '—'}</td>
                    <td className="px-4 py-3 text-right font-mono">{v.venda_itens.length}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatBRL(v.total_bruto)}</td>
                    <td className={`px-4 py-3 text-right font-mono ${v.lucro_bruto < 0 ? 'text-down' : 'text-up'}`}>
                      {formatBRL(v.lucro_bruto)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-text-2">{pct(roiV)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {v.status === 'concluida' && (
                        <Button size="sm" variant="ghost" onClick={() => setCancelando(v)}>
                          Cancelar
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <NovaVendaModal open={novoOpen} onClose={() => setNovoOpen(false)} onSaved={fetchData} />
      <VendaDetalheModal venda={detalhe} onClose={() => setDetalhe(null)} />

      <Modal open={!!cancelando} onClose={() => setCancelando(null)} title="Cancelar venda" size="sm">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-2">
            Cancelar a venda <span className="font-mono">#{cancelando?.numero}</span>? O estoque é devolvido,
            os decants são estornados e os lançamentos no caixa são removidos. A venda não pode ser reaberta.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setCancelando(null)}>Voltar</Button>
            <Button variant="danger" disabled={cancelSubmitting} onClick={confirmarCancelamento}>
              {cancelSubmitting ? 'Cancelando...' : 'Cancelar venda'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
