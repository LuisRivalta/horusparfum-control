import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Modal } from '@/components/shared/Modal'
import { Button, Input, Select } from '@/components/shared/FormControls'
import { somarItens, type ItemInsumo } from '@/lib/insumos'
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

const CLASSIFICACOES = ['amostra', 'brinde', 'marketing', 'uso_interno', 'perda', 'outro']
const ROTULO: Record<string, string> = { amostra: 'Amostra', brinde: 'Brinde', marketing: 'Marketing', uso_interno: 'Uso interno', perda: 'Perda', outro: 'Outro' }

// Corrige o consumo: devolve origens/insumos antigos e regrava. Com o mesmo ml mantém as origens
// gravadas (várias origens); com ml novo a RPC tira do frasco ativo do perfume.
export function CorrigirConsumoDecantModal({ open, transacao, onClose, onSaved }: Props) {
  const { user } = useAuth()
  const [ml, setMl] = useState('')
  const [mlOriginal, setMlOriginal] = useState(0)
  const [classificacao, setClassificacao] = useState('')
  const [custoEmbAntigo, setCustoEmbAntigo] = useState(0)
  const [origens, setOrigens] = useState<OrigemDb[]>([])
  const [itens, setItens] = useState<ItemInsumo[]>([])
  const [insumos, setInsumos] = useState<InsumoOpt[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const decantId = transacao?.decant_id

  useEffect(() => {
    if (!open || !decantId) return
    setErro(null)
    Promise.all([
      supabase.from('decants').select('ml, classificacao, custo_embalagem').eq('id', decantId).single(),
      supabase.from('decant_origens').select('frasco_id, produto_id, ml, abriu_frasco').eq('decant_id', decantId),
      supabase.from('insumo_movimentacoes').select('insumo_id, quantidade').eq('decant_id', decantId),
      supabase.from('insumos').select('id, nome, custo_medio, ativo').order('nome'),
    ]).then(([d, o, m, ins]) => {
      const dec = d.data as { ml: number; classificacao: string; custo_embalagem: number } | null
      setMl(String(Number(dec?.ml ?? '')))
      setMlOriginal(Number(dec?.ml) || 0)
      setClassificacao(dec?.classificacao ?? '')
      setCustoEmbAntigo(Number(dec?.custo_embalagem) || 0)
      setOrigens((o.data as OrigemDb[]) ?? [])
      setItens(somarItens(((m.data as { insumo_id: string; quantidade: number }[]) ?? [])
        .map((x) => ({ insumoId: x.insumo_id, quantidade: -Number(x.quantidade) }))))
      setInsumos((ins.data as InsumoOpt[]) ?? [])
    })
  }, [open, decantId])

  const isPerda = classificacao === 'perda'
  const mlNum = Number(ml) || 0

  async function salvar() {
    if (!transacao || !decantId) return
    if (!classificacao || mlNum <= 0) { setErro('Informe a classificação e os ml'); return }
    setSalvando(true)
    setErro(null)
    const manter = mlNum === mlOriginal && origens.length > 0
    const lista = isPerda ? [] : itens.filter((i) => i.quantidade > 0)
    const { error } = await supabase.rpc('corrigir_consumo_decant', {
      p_transacao_id: transacao.id,
      p_decant_id: decantId,
      p_ml: mlNum,
      p_classificacao: classificacao,
      p_custo_embalagem: isPerda ? 0 : custoEmbAntigo, // só vale quando não há insumos (consumo antigo sem insumos gravados)
      p_responsavel: user?.email ?? transacao.responsavel,
      p_origens: manter
        ? origens.map((o) => (o.abriu_frasco || !o.frasco_id ? { abrir_produto_id: o.produto_id, ml: Number(o.ml) } : { frasco_id: o.frasco_id, ml: Number(o.ml) }))
        : null,
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
