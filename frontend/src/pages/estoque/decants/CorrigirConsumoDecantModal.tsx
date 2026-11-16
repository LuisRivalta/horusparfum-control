import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Modal } from '@/components/shared/Modal'
import { Button, Input, Select } from '@/components/shared/FormControls'
import { custoInsumos, somarItens, type ItemInsumo } from '@/lib/insumos'
import { aplicarDevolucoes, origemParaJson, planejarOrigens } from '@/lib/decantOrigens'
import { InsumosVenda, type InsumoOpt } from '../vendas/InsumosVenda'

export interface TransacaoDecantParaCorrigir {
  id: string
  descricao: string
  valor: number
  responsavel: string | null
  decant_id?: string | null
}

interface Props {
  open: boolean
  transacao: TransacaoDecantParaCorrigir | null
  onClose: () => void
  onSaved: () => void
}

interface OrigemDb { frasco_id: string | null; produto_id: string; ml: number; abriu_frasco: boolean }
interface FrascoDb { id: string; produto_id: string; ml_restante: number; ml_total: number; status: string }

const CLASSIFICACOES = ['amostra', 'brinde', 'marketing', 'uso_interno', 'perda', 'outro']
const ROTULO: Record<string, string> = { amostra: 'Amostra', brinde: 'Brinde', marketing: 'Marketing', uso_interno: 'Uso interno', perda: 'Perda', outro: 'Outro' }

// Corrige o consumo: a RPC devolve origens/insumos antigos e regrava. As novas origens são planejadas
// a partir do estado pós-devolução (aplicarDevolucoes): frasco ativo do perfume e depois um lacrado.
export function CorrigirConsumoDecantModal({ open, transacao, onClose, onSaved }: Props) {
  const { user } = useAuth()
  const [ml, setMl] = useState('')
  const [classificacao, setClassificacao] = useState('')
  const [origens, setOrigens] = useState<OrigemDb[]>([])
  const [produtoId, setProdutoId] = useState('')
  const [frascos, setFrascos] = useState<FrascoDb[]>([])
  const [lacrados, setLacrados] = useState(0)
  const [volume, setVolume] = useState(0)
  const [itens, setItens] = useState<ItemInsumo[]>([])
  const [insumos, setInsumos] = useState<InsumoOpt[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const decantId = transacao?.decant_id

  useEffect(() => {
    if (!open || !decantId) return
    setErro(null)
    ;(async () => {
      const d = await supabase.from('decants').select('ml, classificacao, produto_id').eq('id', decantId).single()
      const dec = d.data as { ml: number; classificacao: string; produto_id: string } | null
      const pid = dec?.produto_id ?? ''
      const [o, m, ins, f, p] = await Promise.all([
        supabase.from('decant_origens').select('frasco_id, produto_id, ml, abriu_frasco').eq('decant_id', decantId),
        supabase.from('insumo_movimentacoes').select('insumo_id, quantidade').eq('decant_id', decantId),
        supabase.from('insumos').select('id, nome, custo_medio, ativo').order('nome'),
        supabase.from('frascos_abertos').select('id, produto_id, ml_restante, ml_total, status').eq('produto_id', pid),
        supabase.from('produtos').select('estoque_atual, volume_ml').eq('id', pid).single(),
      ])
      setMl(String(Number(dec?.ml ?? '')))
      setClassificacao(dec?.classificacao ?? '')
      setProdutoId(pid)
      setOrigens((o.data as OrigemDb[]) ?? [])
      setItens(somarItens(((m.data as { insumo_id: string; quantidade: number }[]) ?? [])
        .map((x) => ({ insumoId: x.insumo_id, quantidade: -Number(x.quantidade) }))))
      setInsumos((ins.data as InsumoOpt[]) ?? [])
      setFrascos((f.data as FrascoDb[]) ?? [])
      const prod = p.data as { estoque_atual: number; volume_ml: number } | null
      setLacrados(Number(prod?.estoque_atual) || 0)
      setVolume(Number(prod?.volume_ml) || 0)
    })()
  }, [open, decantId])

  const isPerda = classificacao === 'perda'
  const mlNum = Number(ml) || 0
  const custoPorInsumo = Object.fromEntries(insumos.map((i) => [i.id, Number(i.custo_medio)]))
  const lista = isPerda ? [] : itens.filter((i) => i.quantidade > 0)

  // estado dos frascos do perfume depois que a RPC devolve os ml deste consumo
  function planejar() {
    const estado = aplicarDevolucoes(
      frascos.map((f) => ({ id: f.id, produtoId: f.produto_id, mlRestante: Number(f.ml_restante), mlTotal: Number(f.ml_total), ativo: f.status === 'ativo' })),
      origens.filter((o) => o.frasco_id).map((o) => ({ frascoId: o.frasco_id as string, ml: Number(o.ml) })),
    )
    return planejarOrigens(mlNum, estado.find((f) => f.produtoId === produtoId && f.ativo) ?? null, produtoId, lacrados, volume)
  }

  async function salvar() {
    if (!transacao || !decantId) return
    if (!classificacao || mlNum <= 0) { setErro('Informe a classificação e os ml'); return }
    const plano = planejar()
    if (!plano) { setErro('Sem ml suficiente no frasco aberto e sem lacrado'); return }
    setSalvando(true)
    setErro(null)
    const { error } = await supabase.rpc('corrigir_consumo_decant', {
      p_transacao_id: transacao.id,
      p_decant_id: decantId,
      p_ml: mlNum,
      p_classificacao: classificacao,
      // sem insumos (ou perda) não sobra custo de embalagem
      p_custo_embalagem: custoInsumos(lista, custoPorInsumo),
      p_responsavel: user?.email ?? transacao.responsavel,
      p_origens: plano.map(origemParaJson),
      p_insumos: lista.map((i) => ({ insumo_id: i.insumoId, quantidade: i.quantidade })),
    })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title="Corrigir consumo de decant">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-2">{transacao?.descricao}</p>
        {erro && <div className="px-3 py-2 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{erro}</div>}
        <Select
          label="Classificação"
          options={CLASSIFICACOES.map((c) => ({ value: c, label: ROTULO[c] }))}
          value={classificacao}
          onChange={(e) => setClassificacao(e.target.value)}
        />
        <Input label="ml" type="number" min="0.5" step="0.5" value={ml} onChange={(e) => setMl(e.target.value)} />
        {!isPerda && (
          <InsumosVenda
            grupos={[{ chave: 'decant', rotulo: 'Decant', titulo: 'Insumos do decant', itens }]}
            insumos={insumos}
            onChange={(_, novos) => setItens(novos)}
          />
        )}
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="button" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar correção'}</Button>
        </div>
      </div>
    </Modal>
  )
}
