// frontend/src/pages/estoque/decants/DecantModal.tsx
import { useState, useEffect } from 'react'
import Decimal from 'decimal.js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn, formatBRL } from '@/lib/utils'
import { Modal } from '@/components/shared/Modal'
import { Button, Select, Input } from '@/components/shared/FormControls'
import { FrascoViewer } from './FrascoViewer'
import { custoInsumos, listaDoItem, type ItemInsumo, type ListaInsumos } from '@/lib/insumos'
import { custoPrevistoOrigens, origemParaJson, planejarOrigens, totalOrigens, type Origem } from '@/lib/decantOrigens'
import { InsumosVenda, type InsumoOpt } from '../vendas/InsumosVenda'

interface FrascoComProduto {
  id: string
  produto_id: string
  ml_total: number
  ml_restante: number
  status: 'ativo' | 'esgotado'
  aberto_em: string
  produtos: { nome: string; foto_url: string | null; volume_ml: number; custo_medio: number | null }
}

interface LinhaListaDb { tipo: ListaInsumos['tipo']; tamanho_ml: number | null; insumo_lista_itens: { insumo_id: string; quantidade: number }[] }
interface FrascoOutro { id: string; produto_id: string; ml_restante: number; ml_total: number; produtos: { nome: string; custo_medio: number | null; volume_ml: number } }

interface Props {
  frasco: FrascoComProduto
  onClose: () => void
  onSaved: () => void
}

const CLASSIFICACOES = [
  { value: 'amostra', label: 'Amostra' },
  { value: 'brinde', label: 'Brinde' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'uso_interno', label: 'Uso interno' },
  { value: 'perda', label: 'Perda' },
  { value: 'outro', label: 'Outro' },
]

const fmtMl = (n: number) => String(Number(n.toFixed(2))).replace('.', ',')

export function DecantModal({ frasco, onClose, onSaved }: Props) {
  const { user } = useAuth()
  const [mlRapido, setMlRapido] = useState<number | null>(null)
  const [mlCustom, setMlCustom] = useState('')
  const [classificacao, setClassificacao] = useState('')
  const [listas, setListas] = useState<ListaInsumos[]>([])
  const [insumos, setInsumos] = useState<InsumoOpt[]>([])
  const [lacrados, setLacrados] = useState(0)
  const [outros, setOutros] = useState<FrascoOutro[]>([])
  const [insumosEdit, setInsumosEdit] = useState<ItemInsumo[] | null>(null) // null = lista padrão do tamanho
  const [origensEdit, setOrigensEdit] = useState<Origem[] | null>(null) // null = caminho padrão
  const [completando, setCompletando] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('insumo_listas').select('tipo, tamanho_ml, insumo_lista_itens(insumo_id, quantidade)'),
      supabase.from('insumos').select('id, nome, custo_medio, ativo').order('nome'),
      supabase.from('produtos').select('estoque_atual').eq('id', frasco.produto_id).single(),
      supabase.from('frascos_abertos').select('id, produto_id, ml_restante, ml_total, produtos(nome, custo_medio, volume_ml)').eq('status', 'ativo'),
    ]).then(([l, ins, p, f]) => {
      setListas(((l.data as LinhaListaDb[]) ?? []).map((x) => ({
        tipo: x.tipo,
        tamanhoMl: x.tamanho_ml != null ? Number(x.tamanho_ml) : null,
        itens: (x.insumo_lista_itens ?? []).map((i) => ({ insumoId: i.insumo_id, quantidade: Number(i.quantidade) })),
      })))
      setInsumos((ins.data as InsumoOpt[]) ?? [])
      setLacrados(Number((p.data as { estoque_atual: number } | null)?.estoque_atual) || 0)
      setOutros(((f.data as unknown as FrascoOutro[]) ?? []).filter((x) => x.produto_id !== frasco.produto_id && Number(x.ml_restante) > 0))
    })
  }, [frasco.produto_id])

  const tamanhos = [...new Set(listas.filter((l) => l.tipo === 'decant' && l.tamanhoMl != null).map((l) => l.tamanhoMl as number))].sort((a, b) => a - b)
  const mlValor = mlRapido ?? (mlCustom !== '' ? (Number(mlCustom) || 0) : 0)
  const isPerda = classificacao === 'perda'

  const volume = Number(frasco.produtos.volume_ml) || frasco.ml_total
  const aberto = { id: frasco.id, produtoId: frasco.produto_id, mlRestante: frasco.ml_restante, mlTotal: frasco.ml_total }
  // Origens completadas à mão, ou o caminho padrão (frasco aberto e depois um lacrado).
  // Sem caminho padrão, fica só o que o frasco aberto cobre (falta o resto).
  const origens: Origem[] = mlValor <= 0 ? [] : origensEdit
    ?? planejarOrigens(mlValor, aberto, frasco.produto_id, lacrados, volume)
    ?? planejarOrigens(Math.min(mlValor, frasco.ml_restante), aberto, frasco.produto_id, 0, 0) ?? []
  const falta = new Decimal(mlValor).sub(totalOrigens(origens)).toNumber()
  const sobra = new Decimal(frasco.ml_restante).sub(mlValor).toNumber()

  const custoMedio: Record<string, number> = { [frasco.produto_id]: frasco.produtos.custo_medio ?? 0 }
  const volumes: Record<string, number> = { [frasco.produto_id]: volume }
  for (const o of outros) { custoMedio[o.produto_id] = o.produtos.custo_medio ?? 0; volumes[o.produto_id] = Number(o.produtos.volume_ml) || 0 }

  const itensInsumo = isPerda ? [] : insumosEdit ?? listaDoItem(listas, 'decant', mlValor || null, 1)
  const custoPorInsumo = Object.fromEntries(insumos.map((i) => [i.id, Number(i.custo_medio)]))
  const custoEmb = custoInsumos(itensInsumo, custoPorInsumo)
  const custoTotal = new Decimal(custoPrevistoOrigens(origens, custoMedio, volumes)).add(custoEmb).toNumber()
  const nomeProduto = (id: string) => id === frasco.produto_id ? frasco.produtos.nome : outros.find((o) => o.produto_id === id)?.produtos.nome ?? 'outro perfume'

  const pctAtual = frasco.ml_restante / frasco.ml_total
  const novoPct = Math.max(sobra, 0) / frasco.ml_total

  function descreverOrigens(): string {
    return origens.map((o) => o.tipo === 'abrir'
      ? `abrir 1 lacrado (${fmtMl(o.ml)} ml)`
      : o.produtoId === frasco.produto_id ? `${fmtMl(o.ml)} ml do aberto` : `${fmtMl(o.ml)} ml de ${nomeProduto(o.produtoId)}`).join(' + ')
  }

  function completarCom(frascoId: string) {
    const f = outros.find((x) => x.id === frascoId)
    if (!f) return
    const ml = Decimal.min(falta, Number(f.ml_restante)).toNumber()
    setOrigensEdit([...origens, { tipo: 'frasco', frascoId: f.id, produtoId: f.produto_id, ml }])
    setCompletando(false)
  }

  function mudouMl() { setErro(null); setInsumosEdit(null); setOrigensEdit(null); setCompletando(false) }

  function handleMlRapido(ml: number) { setMlRapido(ml); setMlCustom(''); mudouMl() }

  function handleCustomChange(e: React.ChangeEvent<HTMLInputElement>) { setMlRapido(null); setMlCustom(e.target.value); mudouMl() }

  async function handleConfirm() {
    if (!classificacao) { setErro('Selecione a classificação'); return }
    if (mlValor <= 0) { setErro('Informe a quantidade de ml'); return }
    if (falta > 0) { setErro('Quantidade maior que o disponível'); return }
    setConfirming(true)
    setErro(null)
    const simples = origens.length === 1 && origens[0].tipo === 'frasco' && origens[0].frascoId === frasco.id
    const { error } = await supabase.rpc('registrar_consumo_decant', {
      p_frasco_id: frasco.id,
      p_ml: mlValor,
      p_classificacao: classificacao,
      p_custo_embalagem: custoEmb,
      p_responsavel: user?.email ?? null,
      p_origens: simples ? null : origens.map(origemParaJson),
      p_insumos: itensInsumo.filter((i) => i.quantidade > 0).map((i) => ({ insumo_id: i.insumoId, quantidade: i.quantidade })),
    })
    if (error) { setErro(error.message); setConfirming(false); return }
    await new Promise((r) => setTimeout(r, 700))
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title={`Consumo — ${frasco.produtos.nome}`} size="lg">
      <div className="flex gap-8 items-start">
        <div className="flex flex-col items-center gap-3 shrink-0">
          <FrascoViewer percentual={confirming ? novoPct : pctAtual} size="lg" />
          <span className="tabular-nums text-sm text-muted">
            {frasco.ml_restante}<span className="text-xs">/{frasco.ml_total}ml</span>
          </span>
        </div>

        <div className="flex flex-col gap-5 flex-1">
          {erro && (
            <div className="px-3 py-2 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{erro}</div>
          )}

          <Select
            label="Classificação"
            options={CLASSIFICACOES}
            value={classificacao}
            onChange={(e) => setClassificacao(e.target.value)}
            required
          />

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-[.08em] text-muted">Quantidade rápida</span>
            <div className="flex gap-2">
              {tamanhos.map((ml) => (
                <button
                  key={ml}
                  onClick={() => handleMlRapido(ml)}
                  disabled={confirming}
                  className={cn(
                    'flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all cursor-pointer',
                    mlRapido === ml
                      ? 'bg-gold text-[#1A1407] border-gold shadow-[0_2px_12px_rgba(201,168,76,0.3)]'
                      : 'border-line bg-surface-2 text-text hover:border-gold-line hover:text-gold'
                  )}
                >
                  {fmtMl(ml)}ml
                </button>
              ))}
            </div>
          </div>

          <Input
            label="Ou ml (custom)"
            type="number" min="0.5" step="0.5"
            value={mlCustom}
            onChange={handleCustomChange}
            placeholder="ML"
          />

          {mlValor > 0 && origens.length > 0 && (
            <div className="flex flex-col gap-1.5 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted">Origem:</span>
                <span>{descreverOrigens()}</span>
              </div>
              {falta <= 0 && sobra >= 0 && (
                <p className="text-sm text-muted">
                  Restará <span className="font-semibold text-text tabular-nums">{fmtMl(sobra)}ml</span>
                  {sobra === 0 && <span className="ml-2 text-down text-xs">(frasco ficará esgotado)</span>}
                </p>
              )}
            </div>
          )}
          {mlValor > 0 && falta > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-down">
              <span>Sem ml suficiente e sem lacrado: faltam {fmtMl(falta)} ml</span>
              {completando ? (
                <Select
                  label="Outro perfume"
                  options={outros
                    .filter((f) => !origens.some((o) => o.tipo === 'frasco' && o.frascoId === f.id))
                    .map((f) => ({ value: f.id, label: `${f.produtos.nome} (${fmtMl(Number(f.ml_restante))} ml)` }))}
                  value=""
                  onChange={(e) => e.target.value && completarCom(e.target.value)}
                />
              ) : (
                <Button type="button" variant="secondary" size="sm" onClick={() => setCompletando(true)}>
                  Completar com outro perfume
                </Button>
              )}
            </div>
          )}

          {!isPerda && (
            <InsumosVenda
              grupos={[{ chave: 'decant', rotulo: 'Decant', titulo: 'Insumos do decant', itens: itensInsumo }]}
              insumos={insumos}
              onChange={(_, itens) => setInsumosEdit(itens)}
            />
          )}

          <div className="flex items-center justify-between border-t border-line pt-3 text-sm">
            <span className="text-muted">Custo do consumo</span>
            <span className="font-mono text-text">{formatBRL(custoTotal)}</span>
          </div>

          <Button onClick={handleConfirm} disabled={mlValor <= 0 || !classificacao || falta > 0 || confirming} className="mt-auto">
            {confirming ? 'Registrando...' : 'Registrar consumo'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
