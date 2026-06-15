// frontend/src/pages/estoque/decants/DecantModal.tsx
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/shared/Modal'
import { Button } from '@/components/shared/FormControls'
import { FrascoViewer } from './FrascoViewer'
import { calcularNovoML, statusAposDecant } from '@/lib/decants'

interface FrascoComProduto {
  id: string
  produto_id: string
  ml_total: number
  ml_restante: number
  status: 'ativo' | 'esgotado'
  aberto_em: string
  produtos: { nome: string; foto_url: string | null; volume_ml: number }
}

interface Props {
  frasco: FrascoComProduto
  onClose: () => void
  onSaved: () => void
}

const ML_RAPIDO = [2, 5, 10] as const

export function DecantModal({ frasco, onClose, onSaved }: Props) {
  const [mlRapido, setMlRapido] = useState<number | null>(null)
  const [mlCustom, setMlCustom] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const mlValor = mlRapido ?? (mlCustom !== '' ? parseInt(mlCustom, 10) : 0)
  const novoML = mlValor > 0 ? calcularNovoML(frasco.ml_restante, mlValor) : null
  const pctAtual = frasco.ml_restante / frasco.ml_total
  const novoPct = novoML !== null ? novoML / frasco.ml_total : pctAtual

  function handleCustomChange(e: React.ChangeEvent<HTMLInputElement>) {
    setMlRapido(null)
    setMlCustom(e.target.value)
    setErro(null)
  }

  function handleMlRapido(ml: number) {
    setMlRapido(ml)
    setMlCustom('')
    setErro(null)
  }

  async function handleConfirm() {
    if (novoML === null || mlValor <= 0) {
      setErro(
        mlValor <= 0
          ? 'Informe a quantidade de ml'
          : 'Quantidade maior que o disponível'
      )
      return
    }
    setConfirming(true)
    setErro(null)
    try {
      const { error: e1 } = await supabase
        .from('frascos_abertos')
        .update({ ml_restante: novoML, status: statusAposDecant(novoML) })
        .eq('id', frasco.id)
      if (e1) throw e1

      const { error: e2 } = await supabase
        .from('decants')
        .insert({ frasco_id: frasco.id, produto_id: frasco.produto_id, ml: mlValor })
      if (e2) throw e2

      // Brief pause for the bottle animation to run before closing
      await new Promise((r) => setTimeout(r, 700))
      onSaved()
    } catch (e: unknown) {
      setErro((e as { message?: string })?.message ?? 'Erro ao registrar decant')
      setConfirming(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={frasco.produtos.nome} size="lg">
      <div className="flex gap-8 items-start">
        {/* 3D bottle — shows novoPct when confirming to animate level drop */}
        <div className="flex flex-col items-center gap-3 shrink-0">
          <FrascoViewer percentual={confirming ? novoPct : pctAtual} size="lg" />
          <span className="tabular-nums text-sm text-muted">
            {frasco.ml_restante}
            <span className="text-xs">/{frasco.ml_total}ml</span>
          </span>
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-5 flex-1">
          {erro && (
            <div className="px-3 py-2 rounded-lg bg-down/10 border border-down/30 text-down text-sm">
              {erro}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-[.08em] text-muted">
              Quantidade rápida
            </span>
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

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-[.08em] text-muted">
              Ou informe a quantidade (ml)
            </label>
            <input
              type="number"
              min={1}
              max={frasco.ml_restante}
              value={mlCustom}
              onChange={handleCustomChange}
              disabled={confirming}
              placeholder="ex: 7"
              className={cn(
                'w-full px-3.5 py-2.5 rounded-lg border border-line bg-surface-2 text-text text-sm placeholder:text-faint',
                'transition-all duration-200 focus:outline-none focus:border-gold/60 focus:shadow-[0_0_0_3px_rgba(201,168,76,0.12)]',
                'hover:border-line-2'
              )}
            />
          </div>

          {novoML !== null && mlValor > 0 && (
            <p className="text-sm text-muted">
              Restará{' '}
              <span className="font-semibold text-text tabular-nums">{novoML}ml</span>
              {novoML === 0 && (
                <span className="ml-2 text-down text-xs">(frasco ficará esgotado)</span>
              )}
            </p>
          )}

          <Button
            onClick={handleConfirm}
            disabled={mlValor <= 0 || confirming}
            className="mt-auto"
          >
            {confirming ? 'Registrando...' : 'Registrar decant'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
