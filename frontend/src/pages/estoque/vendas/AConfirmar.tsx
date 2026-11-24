import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { apiShopify } from '@/lib/apiShopify'
import { ROTULO_STATUS, type PedidoCanal } from '@/lib/canais'
import { Button } from '@/components/shared/FormControls'
import { formatBRL } from '@/lib/utils'
import { NovaVendaModal } from './NovaVendaModal'
import { Modal } from '@/components/shared/Modal'

/** Pedidos que pedem ação: abertos, cancelados após confirmação ou com alerta. */
export const FILTRO_A_CONFIRMAR = 'status.in.(aguardando_pagamento,a_confirmar,cancelado_pos_confirmacao),alerta.not.is.null'

function formatData(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'
}

export function AConfirmar({ onMudou }: { onMudou?: () => void }) {
  const [pedidos, setPedidos] = useState<PedidoCanal[]>([])
  const [loading, setLoading] = useState(true)
  const [aviso, setAviso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState<PedidoCanal | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [desfazendo, setDesfazendo] = useState<PedidoCanal | null>(null)
  const conferiu = useRef(false)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('pedidos_canal').select('*')
      .or(FILTRO_A_CONFIRMAR).order('criado_em', { ascending: false })
    if (error) setErro(error.message)
    setPedidos((data as PedidoCanal[]) || [])
    setLoading(false)
    onMudou?.()
  }, [onMudou])

  useEffect(() => {
    if (conferiu.current) return // StrictMode monta duas vezes: conferir só uma
    conferiu.current = true
    apiShopify.conferir()
      .catch((e: unknown) => setAviso(`Não foi possível conferir a Shopify agora (${e instanceof Error ? e.message : 'erro'}); mostrando o que já está no sistema.`))
      .finally(carregar)
  }, [carregar])

  async function acao(p: PedidoCanal, fazer: () => PromiseLike<{ error: { message: string } | null }>) {
    if (ocupado) return
    setOcupado(p.id)
    setErro(null)
    const { error } = await fazer()
    setOcupado(null)
    if (error) { setErro(error.message); return }
    carregar()
  }

  const desfazer = (p: PedidoCanal) => acao(p, () => supabase.rpc('desfazer_pedido_canal', { p_pedido_id: p.id }))
  const atualizar = (p: PedidoCanal, patch: Partial<PedidoCanal>) =>
    acao(p, () => supabase.from('pedidos_canal').update(patch).eq('id', p.id))

  return (
    <div className="flex flex-col gap-3">
      {aviso && <div className="px-3 py-2.5 rounded-lg bg-gold/10 border border-gold/30 text-text-2 text-sm">{aviso}</div>}
      {erro && <div className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{erro}</div>}

      <div className="border border-line rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line bg-surface">
                <th className="text-left px-4 py-3 text-text-2 font-medium">Pedido</th>
                <th className="text-left px-4 py-3 text-text-2 font-medium">Data</th>
                <th className="text-left px-4 py-3 text-text-2 font-medium">Cliente</th>
                <th className="text-left px-4 py-3 text-text-2 font-medium">Itens</th>
                <th className="text-right px-4 py-3 text-text-2 font-medium">Frete</th>
                <th className="text-right px-4 py-3 text-text-2 font-medium">Total</th>
                <th className="text-left px-4 py-3 text-text-2 font-medium">Situação</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">Carregando...</td></tr>
              ) : pedidos.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">Nenhum pedido a confirmar</td></tr>
              ) : pedidos.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-mono text-muted">{p.numero ?? p.externo_id}</td>
                  <td className="px-4 py-3 text-text-2 text-xs">{formatData(p.criado_em)}</td>
                  <td className="px-4 py-3">{p.cliente || '—'}</td>
                  <td className="px-4 py-3 text-xs">
                    <ul className="flex flex-col gap-0.5">
                      {p.itens.map((i, k) => <li key={k}>{`${i.titulo} × ${i.quantidade}`}</li>)}
                    </ul>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{p.frete != null ? formatBRL(Number(p.frete)) : '—'}</td>
                  <td className="px-4 py-3 text-right font-mono">{p.total != null ? formatBRL(Number(p.total)) : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium">{ROTULO_STATUS[p.status]}</span>
                      {p.alerta && <span className="text-xs text-down">{p.alerta}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {(p.status === 'aguardando_pagamento' || p.status === 'a_confirmar') && (
                        <Button size="sm" disabled={p.status !== 'a_confirmar'} onClick={() => setConfirmando(p)}>Confirmar</Button>
                      )}
                      {p.status === 'cancelado_pos_confirmacao' ? (
                        <>
                          <Button size="sm" variant="danger" disabled={ocupado === p.id} onClick={() => setDesfazendo(p)}>Desfazer venda</Button>
                          <Button size="sm" variant="secondary" disabled={ocupado === p.id}
                            onClick={() => atualizar(p, { status: 'confirmado', alerta: null })}>Manter</Button>
                        </>
                      ) : p.alerta && (
                        <Button size="sm" variant="secondary" disabled={ocupado === p.id} onClick={() => atualizar(p, { alerta: null })}>Ok</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={!!desfazendo} onClose={() => setDesfazendo(null)} title="Desfazer venda" size="sm">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-2">
            O pedido <span className="font-mono">{desfazendo?.numero}</span> foi cancelado na Shopify. Desfazer a venda?
            O estoque é devolvido, os decants são estornados e os lançamentos no caixa são removidos.
          </p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setDesfazendo(null)}>Voltar</Button>
            <Button variant="danger" disabled={!!ocupado}
              onClick={() => { if (desfazendo) desfazer(desfazendo); setDesfazendo(null) }}>
              Sim, desfazer venda
            </Button>
          </div>
        </div>
      </Modal>

      {confirmando && (
        <NovaVendaModal open pedido={confirmando} onClose={() => setConfirmando(null)} onSaved={carregar} />
      )}
    </div>
  )
}
