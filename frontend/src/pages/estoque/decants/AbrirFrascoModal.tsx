// frontend/src/pages/estoque/decants/AbrirFrascoModal.tsx
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/shared/Modal'
import { Button, Select } from '@/components/shared/FormControls'

interface ProdutoDisponivel {
  id: string
  nome: string
  volume_ml: number
  estoque_atual: number
}

interface Props {
  onClose: () => void
  onSaved: () => void
}

export function AbrirFrascoModal({ onClose, onSaved }: Props) {
  const [produtos, setProdutos] = useState<ProdutoDisponivel[]>([])
  const [produtoId, setProdutoId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    carregarProdutos()
  }, [])

  async function carregarProdutos() {
    const [{ data: prodData, error: e1 }, { data: ativosData, error: e2 }] = await Promise.all([
      supabase
        .from('produtos')
        .select('id, nome, volume_ml, estoque_atual')
        .gt('estoque_atual', 0)
        .order('nome'),
      supabase
        .from('frascos_abertos')
        .select('produto_id')
        .eq('status', 'ativo'),
    ])
    if (e1) { setErro(e1.message); return }
    if (e2) { setErro(e2.message); return }
    const idsAtivos = new Set((ativosData ?? []).map((f: { produto_id: string }) => f.produto_id))
    setProdutos((prodData ?? []).filter((p: ProdutoDisponivel) => !idsAtivos.has(p.id)))
  }

  const produtoSelecionado = produtos.find((p) => p.id === produtoId)

  async function handleConfirm() {
    if (!produtoSelecionado) return
    setSubmitting(true)
    setErro(null)
    try {
      const { error: e1 } = await supabase
        .from('produtos')
        .update({ estoque_atual: produtoSelecionado.estoque_atual - 1 })
        .eq('id', produtoSelecionado.id)
      if (e1) throw e1

      const { error: e2 } = await supabase.from('frascos_abertos').insert({
        produto_id: produtoSelecionado.id,
        ml_total: produtoSelecionado.volume_ml,
        ml_restante: produtoSelecionado.volume_ml,
      })
      if (e2) {
        // Rollback: restore stock
        await supabase
          .from('produtos')
          .update({ estoque_atual: produtoSelecionado.estoque_atual })
          .eq('id', produtoSelecionado.id)
        throw e2
      }

      onSaved()
    } catch (e: unknown) {
      setErro((e as { message?: string })?.message ?? 'Erro ao abrir frasco')
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Abrir frasco">
      <div className="flex flex-col gap-5">
        {erro && (
          <div className="px-3 py-2 rounded-lg bg-down/10 border border-down/30 text-down text-sm">
            {erro}
          </div>
        )}

        <Select
          label="Perfume"
          value={produtoId}
          onChange={(e) => setProdutoId(e.target.value)}
          options={produtos.map((p) => ({ value: p.id, label: p.nome }))}
        />

        {produtoSelecionado && (
          <p className="text-sm text-muted">
            Este frasco tem{' '}
            <span className="font-semibold text-text">{produtoSelecionado.volume_ml}ml</span>
          </p>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end pt-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!produtoId || submitting}>
            {submitting ? 'Abrindo...' : 'Confirmar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
