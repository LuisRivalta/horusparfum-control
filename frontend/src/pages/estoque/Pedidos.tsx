import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/shared/Icon'
import { Button } from '@/components/shared/FormControls'
import { formatBRL } from '@/lib/utils'
import type { PedidoStatus } from '@/lib/pedidos'

export interface PedidoRow {
  id: string
  numero: number
  status: PedidoStatus
  valor_total: number
  previsao_chegada: string | null
  responsavel: string | null
  created_at: string
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
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold">Estoque / Compras</p>
          <h1 className="text-3xl font-medium tracking-tight mt-1">Pedidos</h1>
          <p className="text-muted text-sm mt-1">Pedidos a fornecedores e conferência de chegada</p>
        </div>
        <Button onClick={() => setNovoOpen(true)}>
          <Icon name="plus" size={16} />
          Novo pedido
        </Button>
      </div>

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
                      <Button size="sm" onClick={() => setConferindo(p)}>
                        Confirmar chegada
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modais entram nas Tasks 4 e 5: */}
      {/* <NovoPedidoModal open={novoOpen} onClose={...} onCreated={fetchData} /> */}
      {/* <ConferenciaModal pedido={conferindo} onClose={...} onConfirmed={fetchData} /> */}
      {novoOpen && null}
      {conferindo && null}
    </div>
  )
}
