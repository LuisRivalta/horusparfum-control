import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/shared/Icon'
import { Modal } from '@/components/shared/Modal'
import { Button, Input, Select } from '@/components/shared/FormControls'

interface Movimentacao {
  id: string
  produto_id: string
  tipo: string
  quantidade: number
  motivo: string | null
  responsavel: string | null
  saldo_resultante: number | null
  created_at: string
  produtos?: { nome: string } | null
}

interface Produto {
  id: string
  nome: string
  estoque_atual: number
}

export function EstMovimentacoes() {
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState({
    produto_id: '',
    tipo: 'entrada',
    quantidade: '',
    motivo: '',
    responsavel: '',
  })

  async function fetchData() {
    setLoading(true)
    const [{ data: movs }, { data: prods }] = await Promise.all([
      supabase.from('movimentacoes').select('*, produtos(nome)').order('created_at', { ascending: false }),
      supabase.from('produtos').select('id, nome, estoque_atual'),
    ])
    setMovimentacoes(movs || [])
    setProdutos(prods || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const produto = produtos.find(p => p.id === form.produto_id)
    if (!produto) return

    const qtd = Number(form.quantidade)
    const novoSaldo = form.tipo === 'entrada'
      ? produto.estoque_atual + qtd
      : produto.estoque_atual - qtd

    await supabase.from('movimentacoes').insert({
      produto_id: form.produto_id,
      tipo: form.tipo,
      quantidade: qtd,
      motivo: form.motivo || null,
      responsavel: form.responsavel || null,
      saldo_resultante: novoSaldo,
    })

    await supabase.from('produtos').update({ estoque_atual: novoSaldo }).eq('id', form.produto_id)

    setForm({ produto_id: '', tipo: 'entrada', quantidade: '', motivo: '', responsavel: '' })
    setModalOpen(false)
    fetchData()
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold">Estoque</p>
          <h1 className="text-3xl font-medium tracking-tight mt-1">Movimentações</h1>
          <p className="text-muted text-sm mt-1">Histórico de entradas e saídas</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Icon name="plus" size={16} />
          Nova movimentação
        </Button>
      </div>

      <div className="border border-line rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface">
              <th className="text-left px-4 py-3 text-text-2 font-medium">Data</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Produto</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Tipo</th>
              <th className="text-right px-4 py-3 text-text-2 font-medium">Qtd</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Motivo</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Responsável</th>
              <th className="text-right px-4 py-3 text-text-2 font-medium">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">Carregando...</td></tr>
            ) : movimentacoes.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">Nenhuma movimentação registrada</td></tr>
            ) : (
              movimentacoes.map((m) => (
                <tr key={m.id} className="border-b border-line last:border-0 hover:bg-surface-2/50">
                  <td className="px-4 py-3 text-text-2 text-xs">{formatDate(m.created_at)}</td>
                  <td className="px-4 py-3 font-medium">{m.produtos?.nome || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${m.tipo === 'entrada' ? 'bg-up/15 text-up' : 'bg-down/15 text-down'}`}>
                      {m.tipo === 'entrada' ? '↑ Entrada' : '↓ Saída'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{m.quantidade}</td>
                  <td className="px-4 py-3 text-text-2">{m.motivo || '—'}</td>
                  <td className="px-4 py-3 text-text-2">{m.responsavel || '—'}</td>
                  <td className="px-4 py-3 text-right font-mono text-muted">{m.saldo_resultante ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nova movimentação">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Select label="Produto" options={produtos.map(p => ({ value: p.id, label: p.nome }))} value={form.produto_id} onChange={(e) => setForm({ ...form, produto_id: e.target.value })} required />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Tipo" options={[{ value: 'entrada', label: 'Entrada' }, { value: 'saida', label: 'Saída' }]} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} required />
            <Input label="Quantidade" type="number" min="1" value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} required />
          </div>
          <Input label="Motivo" value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} placeholder="Ex: Venda balcão, Reposição" />
          <Input label="Responsável" value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} />
          <div className="flex justify-end gap-3 mt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit">Registrar</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
