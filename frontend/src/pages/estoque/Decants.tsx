// frontend/src/pages/estoque/Decants.tsx
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { Icon } from '@/components/shared/Icon'
import { Button } from '@/components/shared/FormControls'
import { FrascoViewer } from './decants/FrascoViewer'
import { AbrirFrascoModal } from './decants/AbrirFrascoModal'
import { DecantModal } from './decants/DecantModal'

interface FrascoComProduto {
  id: string
  produto_id: string
  ml_total: number
  ml_restante: number
  status: 'ativo' | 'esgotado'
  aberto_em: string
  produtos: { nome: string; foto_url: string | null; volume_ml: number }
}

export function EstDecants() {
  const [frascos, setFrascos] = useState<FrascoComProduto[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [abrindo, setAbrindo] = useState(false)
  const [decantando, setDecantando] = useState<FrascoComProduto | null>(null)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<string | null>(null)

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setLoading(true)
    const { data, error } = await supabase
      .from('frascos_abertos')
      .select('*, produtos(nome, foto_url, volume_ml)')
      .order('aberto_em', { ascending: false })
    if (error) setErro(error.message)
    else setFrascos((data as FrascoComProduto[]) ?? [])
    setLoading(false)
  }

  async function excluirFrasco(id: string) {
    const { error } = await supabase.from('frascos_abertos').delete().eq('id', id)
    if (error) { setErro(error.message); return }
    setFrascos((prev) => prev.filter((f) => f.id !== id))
  }

  return (
    <>
      <div className="flex flex-col gap-6 stagger">
        <div className="flex items-end justify-between">
          <div>
            <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold flex items-center gap-2">
              <span className="w-1 h-1 bg-gold rotate-45" />
              Estoque / Decants
            </p>
            <h1 className="text-4xl tracking-tight mt-1.5">Decants</h1>
          </div>
          <Button onClick={() => setAbrindo(true)}>
            <Icon name="plus" size={16} />
            Abrir frasco
          </Button>
        </div>

        {erro && (
          <div className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">
            Erro ao carregar: {erro}
          </div>
        )}

        {!loading && !erro && frascos.length === 0 && (
          <div className="text-center py-20 text-muted">
            <Icon name="droplet" size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhum frasco aberto</p>
            <p className="text-xs mt-1 opacity-60">Clique em "Abrir frasco" para começar</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {frascos.map((frasco) => {
            const pct = frasco.ml_restante / frasco.ml_total
            const esgotado = frasco.status === 'esgotado'
            return (
              <div
                key={frasco.id}
                onClick={() => !esgotado && setDecantando(frasco)}
                className={cn(
                  'gold-hairline bg-surface border border-line rounded-xl p-5 flex flex-col gap-4',
                  esgotado
                    ? 'opacity-50'
                    : 'cursor-pointer hover:-translate-y-1 transition-transform duration-200 glow-card'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {frasco.produtos.foto_url ? (
                      <img
                        src={frasco.produtos.foto_url}
                        alt={frasco.produtos.nome}
                        className="w-10 h-10 rounded-lg object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-surface-2 border border-line flex items-center justify-center shrink-0">
                        <Icon name="droplet" size={16} className="text-gold/50" />
                      </div>
                    )}
                    <span className="font-medium text-sm truncate">{frasco.produtos.nome}</span>
                  </div>
                  {esgotado && (
                    confirmandoExclusao === frasco.id ? (
                      <div
                        className="flex items-center gap-1 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="text-[0.65rem] text-down/70 whitespace-nowrap">Excluir?</span>
                        <button
                          onClick={() => { excluirFrasco(frasco.id); setConfirmandoExclusao(null) }}
                          className="w-6 h-6 flex items-center justify-center rounded text-down hover:bg-down/15 transition-colors cursor-pointer"
                          aria-label="Confirmar exclusão"
                        >
                          <Icon name="check" size={12} />
                        </button>
                        <button
                          onClick={() => setConfirmandoExclusao(null)}
                          className="w-6 h-6 flex items-center justify-center rounded text-muted hover:bg-surface-3 transition-colors cursor-pointer"
                          aria-label="Cancelar exclusão"
                        >
                          <Icon name="x" size={12} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmandoExclusao(frasco.id) }}
                        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-down/60 hover:text-down hover:bg-down/10 transition-colors cursor-pointer"
                        aria-label="Excluir frasco"
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    )
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <FrascoViewer percentual={pct} size="sm" />
                  <div className="flex flex-col gap-2 flex-1">
                    {esgotado && (
                      <span className="text-[0.6rem] font-mono uppercase tracking-widest text-down/70 border border-down/30 rounded px-1.5 py-0.5 w-fit">
                        Esgotado
                      </span>
                    )}
                    <span className="tabular-nums text-lg font-light">
                      {frasco.ml_restante}
                      <span className="text-muted text-sm">/{frasco.ml_total}ml</span>
                    </span>
                    <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-gold/60 to-gold transition-all duration-500"
                        style={{ width: `${pct * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {abrindo && (
        <AbrirFrascoModal
          onClose={() => setAbrindo(false)}
          onSaved={() => { setAbrindo(false); carregar() }}
        />
      )}
      {decantando && (
        <DecantModal
          frasco={decantando}
          onClose={() => setDecantando(null)}
          onSaved={() => { setDecantando(null); carregar() }}
        />
      )}
    </>
  )
}
