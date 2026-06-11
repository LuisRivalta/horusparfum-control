import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Modal } from '@/components/shared/Modal'
import { Button, Input, Select } from '@/components/shared/FormControls'

interface ProdutoOpcao { id: string; nome: string; estoque_atual: number }

interface Props {
  open: boolean
  onClose: () => void
  onDone: () => void
  /** pré-seleciona um produto (atalho do modal de detalhes) */
  produtoId?: string
}

const MOTIVOS = [
  { value: 'venda', label: 'Venda' },
  { value: 'perda', label: 'Perda' },
  { value: 'uso_interno', label: 'Uso interno' },
  { value: 'outro', label: 'Outro' },
]

export function SaidaRapidaModal({ open, onClose, onDone, produtoId }: Props) {
  const { user } = useAuth()
  const [produtos, setProdutos] = useState<ProdutoOpcao[]>([])
  const [form, setForm] = useState({ produto_id: '', qtd: '1', motivo: '' })
  const [erro, setErro] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setErro(null)
    setForm({ produto_id: produtoId || '', qtd: '1', motivo: '' })
    supabase.from('produtos').select('id, nome, estoque_atual').order('nome')
      .then(({ data, error }) => {
        if (error) console.error('Erro ao carregar produtos:', error)
        setProdutos(data || [])
      })
  }, [open, produtoId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setErro(null)
    if (!form.produto_id) {
      setErro('Selecione um produto')
      return
    }
    if (!form.motivo) {
      setErro('Selecione o motivo')
      return
    }
    const qtdNum = Number(form.qtd)
    if (!Number.isInteger(qtdNum) || qtdNum < 1) {
      setErro('Quantidade deve ser um número inteiro maior que zero')
      return
    }
    setSubmitting(true)
    const { error } = await supabase.rpc('registrar_saida', {
      p_produto_id: form.produto_id,
      p_qtd: qtdNum,
      p_motivo: form.motivo,
      p_responsavel: user?.email || null,
    })
    setSubmitting(false)
    if (error) {
      setErro(error.message)
      return
    }
    onDone()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Registrar saída">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Select
          label="Produto"
          options={produtos.map(p => ({ value: p.id, label: `${p.nome} (${p.estoque_atual} em estoque)` }))}
          value={form.produto_id}
          onChange={(e) => setForm({ ...form, produto_id: e.target.value })}
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Quantidade"
            type="number" min="1" step="1"
            value={form.qtd}
            onChange={(e) => setForm({ ...form, qtd: e.target.value })}
            required
          />
          <Select
            label="Motivo"
            options={MOTIVOS}
            value={form.motivo}
            onChange={(e) => setForm({ ...form, motivo: e.target.value })}
            required
          />
        </div>
        {erro && (
          <div role="alert" className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{erro}</div>
        )}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Registrando...' : 'Registrar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
