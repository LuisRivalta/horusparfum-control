import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Modal } from '@/components/shared/Modal'
import { Button, Input, Select } from '@/components/shared/FormControls'
import { Icon } from '@/components/shared/Icon'
import {
  validarConferencia, DIVERGENCIA_TIPOS,
  type ConferenciaItem, type DivergenciaTipo,
} from '@/lib/pedidos'

interface ItemRow {
  id: string
  qtd_pedida: number
  preco_unitario: number
  produtos: { nome: string; foto_url: string | null } | null
}

interface Props {
  pedido: { id: string; numero: number } | null
  onClose: () => void
  onConfirmed: () => void
}

interface ConferenciaState extends ConferenciaItem {
  nome: string
  fotoUrl: string | null
}

export function ConferenciaModal({ pedido, onClose, onConfirmed }: Props) {
  const { user } = useAuth()
  const [itens, setItens] = useState<ConferenciaState[]>([])
  const [erros, setErros] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [rpcError, setRpcError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    if (!pedido) { setItens([]); return }
    setItens([])
    setErros([])
    setRpcError(null)
    setFetchError(null)
    setLoading(true)
    supabase
      .from('pedido_itens')
      .select('id, qtd_pedida, preco_unitario, produtos(nome, foto_url)')
      .eq('pedido_id', pedido.id)
      .then(({ data, error }) => {
        setLoading(false)
        if (error) {
          setFetchError(error.message)
          return
        }
        setItens(((data as unknown) as ItemRow[] | null || []).map(item => ({
          itemId: item.id,
          qtdPedida: item.qtd_pedida,
          qtdRecebida: item.qtd_pedida,
          divergenciaTipo: null,
          divergenciaObs: '',
          nome: item.produtos?.nome || '—',
          fotoUrl: item.produtos?.foto_url || null,
        })))
      })
  }, [pedido])

  function setItem(itemId: string, patch: Partial<ConferenciaState>) {
    setItens(prev => prev.map(i => (i.itemId === itemId ? { ...i, ...patch } : i)))
    setErros([])
  }

  const divergentes = itens.filter(i => i.qtdRecebida !== i.qtdPedida).length

  async function handleConfirm() {
    if (submitting || !pedido) return
    setRpcError(null)
    const validacao = validarConferencia(itens)
    if (validacao.length > 0) {
      setErros(validacao)
      return
    }
    setSubmitting(true)
    const { error } = await supabase.rpc('confirmar_recebimento', {
      p_pedido_id: pedido.id,
      p_itens: itens.map(i => {
        const divergente = i.qtdRecebida !== i.qtdPedida
        return {
          item_id: i.itemId,
          qtd_recebida: i.qtdRecebida,
          divergencia_tipo: divergente ? i.divergenciaTipo : null,
          divergencia_obs: divergente ? (i.divergenciaObs.trim() || null) : null,
        }
      }),
      p_recebido_por: user?.email || null,
    })
    setSubmitting(false)
    if (error) {
      setRpcError(error.message)
      return
    }
    onConfirmed()
    onClose()
  }

  return (
    <Modal
      open={!!pedido}
      onClose={onClose}
      title={pedido ? `Conferência — Pedido #${pedido.numero}` : ''}
      size="lg"
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          Confira fisicamente cada item e ajuste a quantidade recebida se houver diferença.
        </p>
        {loading && <p className="text-sm text-muted py-4 text-center">Carregando itens...</p>}
        {fetchError && (
          <div role="alert" className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">
            Falha ao carregar itens: {fetchError}
          </div>
        )}

        {itens.map((item) => {
          const divergente = item.qtdRecebida !== item.qtdPedida
          return (
            <div
              key={item.itemId}
              className={`border rounded-xl p-3 flex flex-col gap-3 ${divergente ? 'border-warn/40 bg-warn/5' : 'border-line'}`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-surface-2 overflow-hidden flex items-center justify-center shrink-0">
                  {item.fotoUrl
                    ? <img src={item.fotoUrl} alt={item.nome} className="w-full h-full object-cover" />
                    : <Icon name="box" size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{item.nome}</div>
                  <div className="text-xs text-muted font-mono">Pedido: {item.qtdPedida} un.</div>
                </div>
                <div className="w-28">
                  <Input
                    label="Qtd recebida"
                    type="number" min="0" step="1"
                    value={String(item.qtdRecebida)}
                    onChange={(e) => {
                      const qtd = Number(e.target.value)
                      setItem(item.itemId, qtd === item.qtdPedida
                        ? { qtdRecebida: qtd, divergenciaTipo: null, divergenciaObs: '' }
                        : { qtdRecebida: qtd })
                    }}
                  />
                </div>
              </div>

              {divergente && (
                <div className="grid grid-cols-2 gap-3 pl-13">
                  <Select
                    label="Tipo de divergência"
                    options={DIVERGENCIA_TIPOS.map(t => ({ value: t.value, label: t.label }))}
                    value={item.divergenciaTipo || ''}
                    onChange={(e) => setItem(item.itemId, {
                      divergenciaTipo: (e.target.value || null) as DivergenciaTipo | null,
                    })}
                  />
                  <Input
                    label="Observação"
                    value={item.divergenciaObs}
                    onChange={(e) => setItem(item.itemId, { divergenciaObs: e.target.value })}
                    placeholder="Descreva a divergência"
                  />
                </div>
              )}
            </div>
          )
        })}

        {erros.map((e, i) => (
          <div key={i} role="alert" className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{e}</div>
        ))}
        {rpcError && (
          <div role="alert" className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">
            Falha ao confirmar: {rpcError} — o pedido continua aguardando, tente novamente.
          </div>
        )}

        <div className="flex items-center justify-between border-t border-line pt-3">
          <span className="text-sm text-muted">
            {itens.length - divergentes} {itens.length - divergentes === 1 ? 'item ok' : 'itens ok'}
            {divergentes > 0 && <span className="text-warn"> · {divergentes} divergência{divergentes > 1 ? 's' : ''}</span>}
          </span>
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="button" onClick={handleConfirm} disabled={submitting || loading || itens.length === 0}>
              {submitting ? 'Confirmando...' : 'Confirmar recebimento'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
