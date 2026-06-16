import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/shared/Modal'
import { formatBRL } from '@/lib/utils'

export interface VendaResumo {
  id: string
  numero: number
  total_bruto: number
  total_custo: number
  lucro_bruto: number
}

interface ItemDetalhe {
  id: string
  tipo: 'produto' | 'decant'
  ml: number | null
  quantidade: number
  preco_unitario: number
  custo_unitario: number
  custo_embalagem: number
  taxa_rateada: number
  frete_rateado: number
  lucro: number
  produtos: { nome: string } | null
}

interface Props {
  venda: VendaResumo | null
  onClose: () => void
}

export function VendaDetalheModal({ venda, onClose }: Props) {
  const [itens, setItens] = useState<ItemDetalhe[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!venda) { setItens([]); return }
    setLoading(true)
    supabase
      .from('venda_itens')
      .select('id, tipo, ml, quantidade, preco_unitario, custo_unitario, custo_embalagem, taxa_rateada, frete_rateado, lucro, produtos(nome)')
      .eq('venda_id', venda.id)
      .then(({ data }) => {
        setItens((data as unknown as ItemDetalhe[]) || [])
        setLoading(false)
      })
  }, [venda])

  return (
    <Modal open={!!venda} onClose={onClose} title={venda ? `Venda #${venda.numero}` : ''} size="lg">
      {loading ? (
        <p className="py-8 text-center text-muted">Carregando...</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="border border-line rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface">
                  <th className="text-left px-3 py-2 text-text-2 font-medium">Item</th>
                  <th className="text-right px-3 py-2 text-text-2 font-medium">Qtd</th>
                  <th className="text-right px-3 py-2 text-text-2 font-medium">Preço</th>
                  <th className="text-right px-3 py-2 text-text-2 font-medium">Custo</th>
                  <th className="text-right px-3 py-2 text-text-2 font-medium">Taxa+Frete</th>
                  <th className="text-right px-3 py-2 text-text-2 font-medium">Lucro</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((it) => (
                  <tr key={it.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 font-medium">
                      {it.produtos?.nome || '—'}
                      {it.tipo === 'decant' && <span className="text-muted text-xs"> · {it.ml}ml</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{it.quantidade}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatBRL(it.preco_unitario)}</td>
                    <td className="px-3 py-2 text-right font-mono text-text-2">{formatBRL((it.custo_unitario + it.custo_embalagem) * it.quantidade)}</td>
                    <td className="px-3 py-2 text-right font-mono text-text-2">{formatBRL(it.taxa_rateada + it.frete_rateado)}</td>
                    <td className={`px-3 py-2 text-right font-mono ${it.lucro < 0 ? 'text-down' : 'text-up'}`}>{formatBRL(it.lucro)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {venda && (
            <div className="flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted">Bruto</span><span className="font-mono">{formatBRL(venda.total_bruto)}</span></div>
              <div className="flex justify-between"><span className="text-muted">Custo</span><span className="font-mono">{formatBRL(venda.total_custo)}</span></div>
              <div className="flex justify-between text-base">
                <span>Lucro</span>
                <span className={`font-mono ${venda.lucro_bruto < 0 ? 'text-down' : 'text-up'}`}>{formatBRL(venda.lucro_bruto)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
