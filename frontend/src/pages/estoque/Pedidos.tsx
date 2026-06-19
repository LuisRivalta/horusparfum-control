import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/shared/Icon'
import { Button } from '@/components/shared/FormControls'
import { Modal } from '@/components/shared/Modal'
import { formatBRL } from '@/lib/utils'
import type { PedidoStatus } from '@/lib/pedidos'
import { NovoPedidoModal } from './pedidos/NovoPedidoModal'
import { ConferenciaModal } from './pedidos/ConferenciaModal'

export interface PedidoRow {
  id: string
  numero: number
  status: PedidoStatus
  valor_total: number
  previsao_chegada: string | null
  responsavel: string | null
  created_at: string
  fornecedor_id: string
  fornecedores: { nome: string } | null
  pedido_itens: { id: string }[]
}

const STATUS_BADGE: Record<PedidoStatus, { label: string; cls: string }> = {
  aguardando: { label: 'Aguardando', cls: 'bg-gold-dim text-gold' },
  recebido: { label: 'Recebido', cls: 'bg-up/15 text-up' },
  cancelado: { label: 'Cancelado', cls: 'bg-line text-muted' },
}

export function EstPedidos() {
  const [pedidos, setPedidos] = useState<PedidoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [novoOpen, setNovoOpen] = useState(false)
  const [conferindo, setConferindo] = useState<PedidoRow | null>(null)
  const [cancelando, setCancelando] = useState<PedidoRow | null>(null)
  const [cancelSubmitting, setCancelSubmitting] = useState(false)
  const [editando, setEditando] = useState<PedidoRow | null>(null)
  const ctx = useOutletContext<{ actionSlot: HTMLElement | null } | null>()
  const actionSlot = ctx?.actionSlot ?? null

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('pedidos')
      .select('*, fornecedores(nome), pedido_itens(id)')
      .order('created_at', { ascending: false })
    if (error) console.error('Erro ao carregar pedidos:', error)
    setPedidos(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  function formatDate(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  return (
    <div className="flex flex-col gap-5">
      {actionSlot && createPortal(
        <Button onClick={() => setNovoOpen(true)}>
          <Icon name="plus" size={16} />
          Novo pedido
        </Button>,
        actionSlot
      )}

      <div className="border border-line rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface">
              <th className="text-left px-4 py-3 text-text-2 font-medium">Nº</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Fornecedor</th>
              <th className="text-right px-4 py-3 text-text-2 font-medium">Itens</th>
              <th className="text-right px-4 py-3 text-text-2 font-medium">Total</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Previsão</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Status</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Responsável</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">Carregando...</td></tr>
            ) : pedidos.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">Nenhum pedido registrado</td></tr>
            ) : (
              pedidos.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0 hover:bg-surface-2/50">
                  <td className="px-4 py-3 font-mono text-muted">#{p.numero}</td>
                  <td className="px-4 py-3 font-medium">{p.fornecedores?.nome || '—'}</td>
                  <td className="px-4 py-3 text-right font-mono">{p.pedido_itens.length}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatBRL(p.valor_total)}</td>
                  <td className="px-4 py-3 text-text-2 text-xs">{formatDate(p.previsao_chegada)}</td>
                  <td className="px-4 py-3">
                    {(() => {
                      const badge = STATUS_BADGE[p.status] ?? { label: p.status, cls: 'bg-line text-muted' }
                      return (
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                      )
                    })()}
                  </td>
                  <td className="px-4 py-3 text-text-2">{p.responsavel || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {p.status === 'aguardando' && (
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" onClick={() => setConferindo(p)}>
                          Confirmar chegada
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setEditando(p)}>
                          Editar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setCancelando(p)}>
                          Cancelar
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <NovoPedidoModal
        open={novoOpen || !!editando}
        onClose={() => { setNovoOpen(false); setEditando(null) }}
        onSaved={fetchData}
        pedidoParaEditar={editando ? {
          id: editando.id,
          numero: editando.numero,
          fornecedor_id: editando.fornecedor_id,
          previsao_chegada: editando.previsao_chegada,
          valor_total: editando.valor_total,
        } : undefined}
      />
      <ConferenciaModal
        pedido={conferindo ? { id: conferindo.id, numero: conferindo.numero } : null}
        onClose={() => setConferindo(null)}
        onConfirmed={fetchData}
      />

      <Modal open={!!cancelando} onClose={() => setCancelando(null)} title="Cancelar pedido" size="sm">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-2">
            Cancelar o pedido <span className="font-mono">#{cancelando?.numero}</span>? Pedido cancelado não movimenta estoque e não pode ser reaberto.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setCancelando(null)}>Voltar</Button>
            <Button
              variant="danger"
              disabled={cancelSubmitting}
              onClick={async () => {
                if (!cancelando || cancelSubmitting) return
                setCancelSubmitting(true)
                const { error } = await supabase
                  .from('pedidos')
                  .update({ status: 'cancelado' })
                  .eq('id', cancelando.id)
                  .eq('status', 'aguardando')
                setCancelSubmitting(false)
                if (error) console.error('Erro ao cancelar pedido:', error)
                setCancelando(null)
                fetchData()
              }}
            >
              {cancelSubmitting ? 'Cancelando...' : 'Cancelar pedido'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
