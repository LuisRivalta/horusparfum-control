// frontend/src/pages/estoque/decants/DecantModal.tsx
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn, formatBRL } from '@/lib/utils'
import { Modal } from '@/components/shared/Modal'
import { Button, Select, Input } from '@/components/shared/FormControls'
import { FrascoViewer } from './FrascoViewer'
import { calcularNovoML } from '@/lib/decants'
import { custoDecantUnitario } from '@/lib/vendas'

interface FrascoComProduto {
  id: string
  produto_id: string
  ml_total: number
  ml_restante: number
  status: 'ativo' | 'esgotado'
  aberto_em: string
  produtos: { nome: string; foto_url: string | null; volume_ml: number; custo_medio: number | null }
}

interface Embalagem { tamanho_ml: number; custo: number }

interface Props {
  frasco: FrascoComProduto
  onClose: () => void
  onSaved: () => void
}

const ML_RAPIDO = [2, 5, 10] as const

const CLASSIFICACOES = [
  { value: 'amostra', label: 'Amostra' },
  { value: 'brinde', label: 'Brinde' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'uso_interno', label: 'Uso interno' },
  { value: 'perda', label: 'Perda' },
  { value: 'outro', label: 'Outro' },
]

export function DecantModal({ frasco, onClose, onSaved }: Props) {
  const { user } = useAuth()
  const [mlRapido, setMlRapido] = useState<number | null>(null)
  const [mlCustom, setMlCustom] = useState('')
  const [classificacao, setClassificacao] = useState('')
  const [custoEmb, setCustoEmb] = useState('0')
  const [embalagens, setEmbalagens] = useState<Embalagem[]>([])
  const [confirming, setConfirming] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('embalagens_decant').select('tamanho_ml, custo').eq('ativo', true)
      .then(({ data }) => setEmbalagens((data as Embalagem[]) ?? []))
  }, [])

  const mlValor = mlRapido ?? (mlCustom !== '' ? (parseInt(mlCustom, 10) || 0) : 0)
  const novoML = mlValor > 0 ? calcularNovoML(frasco.ml_restante, mlValor) : null
  const pctAtual = frasco.ml_restante / frasco.ml_total
  const novoPct = novoML !== null ? novoML / frasco.ml_total : pctAtual

  const isPerda = classificacao === 'perda'
  const custoPerfume = custoDecantUnitario(mlValor, frasco.produtos.custo_medio ?? 0, frasco.ml_total)
  const embValor = isPerda ? 0 : (Number(custoEmb) || 0)
  const custoTotal = custoPerfume + embValor

  function aplicarEmbalagemPorMl(ml: number) {
    const emb = embalagens.find((e) => e.tamanho_ml === ml)
    if (emb) setCustoEmb(String(emb.custo))
  }

  function handleMlRapido(ml: number) {
    setMlRapido(ml); setMlCustom(''); setErro(null)
    aplicarEmbalagemPorMl(ml)
  }

  function handleCustomChange(e: React.ChangeEvent<HTMLInputElement>) {
    setMlRapido(null); setMlCustom(e.target.value); setErro(null)
    aplicarEmbalagemPorMl(parseInt(e.target.value, 10) || 0)
  }

  async function handleConfirm() {
    if (!classificacao) { setErro('Selecione a classificação'); return }
    if (novoML === null || mlValor <= 0) {
      setErro(mlValor <= 0 ? 'Informe a quantidade de ml' : 'Quantidade maior que o disponível')
      return
    }
    setConfirming(true)
    setErro(null)
    const { error } = await supabase.rpc('registrar_consumo_decant', {
      p_frasco_id: frasco.id,
      p_ml: mlValor,
      p_classificacao: classificacao,
      p_custo_embalagem: embValor,
      p_responsavel: user?.email ?? null,
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
              {ML_RAPIDO.map((ml) => (
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
                  {ml}ml
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <Input
              label="Ou ml (custom)"
              type="number" min={1} max={frasco.ml_restante}
              value={mlCustom}
              onChange={handleCustomChange}
              placeholder="ML"
            />
            {!isPerda && (
              <Input
                label="Embalagem (R$)"
                type="number" step="0.01" min="0"
                value={custoEmb}
                onChange={(e) => setCustoEmb(e.target.value)}
              />
            )}
          </div>

          {novoML !== null && mlValor > 0 && (
            <p className="text-sm text-muted">
              Restará <span className="font-semibold text-text tabular-nums">{novoML}ml</span>
              {novoML === 0 && <span className="ml-2 text-down text-xs">(frasco ficará esgotado)</span>}
            </p>
          )}

          <div className="flex items-center justify-between border-t border-line pt-3 text-sm">
            <span className="text-muted">Custo do consumo</span>
            <span className="font-mono text-text">{formatBRL(custoTotal)}</span>
          </div>

          <Button onClick={handleConfirm} disabled={mlValor <= 0 || !classificacao || confirming} className="mt-auto">
            {confirming ? 'Registrando...' : 'Registrar consumo'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
