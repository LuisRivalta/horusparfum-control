import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Modal } from '@/components/shared/Modal'
import { Button, Input } from '@/components/shared/FormControls'
import { aplicarCompra } from '@/lib/insumos'

export interface Insumo {
  id: string
  nome: string
  unidade: string
  estoque_atual: number
  estoque_minimo: number
  custo_medio: number
  ativo: boolean
}

// custo médio tem 4 casas: formatBRL (2 casas) esconderia a diferença
export const formatCusto = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 4 })

interface Props { insumo: Insumo; onClose: () => void; onSaved: () => void }

export function CompraInsumoModal({ insumo, onClose, onSaved }: Props) {
  const { user } = useAuth()
  const [qtd, setQtd] = useState('')
  const [valor, setValor] = useState('')
  const [forma, setForma] = useState('')
  // saldo negativo no sistema: começa em 0 (a RPC não aceita contado < 0; a diferença vira acerto)
  const [contado, setContado] = useState(String(Math.max(insumo.estoque_atual, 0)))
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const q = Number(qtd), v = Number(valor), c = Number(contado)
  const valido = q > 0 && valor !== '' && v >= 0 && contado !== ''
  const previa = valido ? aplicarCompra(insumo.estoque_atual, insumo.custo_medio, c, q, v) : null

  async function confirmar() {
    setSalvando(true)
    const { error } = await supabase.rpc('registrar_compra_insumo', {
      p_insumo_id: insumo.id, p_qtd: q, p_valor_total: v, p_saldo_contado: c,
      p_forma_pagamento: forma || null, p_responsavel: user?.email ?? null,
    })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title={`Comprar — ${insumo.nome}`}>
      <div className="flex flex-col gap-4 p-5">
        {erro && <div className="px-3 py-2 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{erro}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Quantidade comprada" type="number" min="0" step="any" value={qtd} onChange={(e) => setQtd(e.target.value)} />
          <Input label="Valor total (R$)" type="number" min="0" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} />
          <Input label="Forma de pagamento" value={forma} onChange={(e) => setForma(e.target.value)} placeholder="Pix, Cartão…" />
          <Input label="Quantos sobraram?" type="number" step="any" value={contado} onChange={(e) => setContado(e.target.value)} />
        </div>
        <p className="text-xs text-muted">Sistema diz {insumo.estoque_atual} {insumo.unidade}. Conte o que sobrou antes de lançar a compra.</p>
        {previa && (
          <div className="flex flex-col gap-1 border-t border-line pt-3 text-sm">
            <span className="text-muted">Custo por unidade: <span className="font-mono text-text">{formatCusto(previa.custoUnitarioCompra)}</span></span>
            <span className="text-muted">Novo custo médio: <span className="font-mono text-text">{formatCusto(previa.novoCustoMedio)}</span></span>
            <span className="text-muted">Novo estoque: <span className="font-mono text-text">{previa.novoEstoque} {insumo.unidade}</span></span>
            {previa.diferenca < 0 && (
              <span className="text-down">{`${Math.abs(previa.diferenca)} serão lançados como perda`}</span>
            )}
          </div>
        )}
        <Button onClick={confirmar} disabled={!valido || salvando}>
          {salvando ? 'Registrando...' : 'Confirmar compra'}
        </Button>
      </div>
    </Modal>
  )
}
