import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/shared/Icon'
import { Modal } from '@/components/shared/Modal'
import { Button, Input, Select } from '@/components/shared/FormControls'
import { formatBRL } from '@/lib/utils'

interface Transacao {
  id: string
  descricao: string
  tipo: string
  valor: number
  categoria: string | null
  forma_pagamento: string | null
  responsavel: string | null
  created_at: string
  origem?: string
}

export function FinTransacoes() {
  const [transacoes, setTransacoes] = useState<Transacao[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState({
    descricao: '',
    tipo: 'entrada',
    valor: '',
    categoria: '',
    forma_pagamento: '',
    responsavel: '',
  })

  async function fetchData() {
    setLoading(true)
    const { data } = await supabase.from('transacoes').select('*').order('created_at', { ascending: false })
    setTransacoes(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await supabase.from('transacoes').insert({
      descricao: form.descricao,
      tipo: form.tipo,
      valor: Number(form.valor),
      categoria: form.categoria || null,
      forma_pagamento: form.forma_pagamento || null,
      responsavel: form.responsavel || null,
    })
    setForm({ descricao: '', tipo: 'entrada', valor: '', categoria: '', forma_pagamento: '', responsavel: '' })
    setModalOpen(false)
    fetchData()
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  const categoriaOpts = [
    { value: 'Vendas', label: 'Vendas' },
    { value: 'Fornecedores', label: 'Fornecedores' },
    { value: 'Marketing', label: 'Marketing' },
    { value: 'Operacional', label: 'Operacional' },
    { value: 'Outros', label: 'Outros' },
  ]

  const pagamentoOpts = [
    { value: 'Pix', label: 'Pix' },
    { value: 'Cartão', label: 'Cartão' },
    { value: 'Boleto', label: 'Boleto' },
    { value: 'Transferência', label: 'Transferência' },
    { value: 'Dinheiro', label: 'Dinheiro' },
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold">Financeiro</p>
          <h1 className="text-3xl font-medium tracking-tight mt-1">Transações</h1>
          <p className="text-muted text-sm mt-1">Registro de entradas e saídas</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Icon name="plus" size={16} />
          Nova transação
        </Button>
      </div>

      <div className="border border-line rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface">
              <th className="text-left px-4 py-3 text-text-2 font-medium">Data</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Descrição</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Tipo</th>
              <th className="text-right px-4 py-3 text-text-2 font-medium">Valor</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Categoria</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Pagamento</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">Carregando...</td></tr>
            ) : transacoes.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">Nenhuma transação registrada</td></tr>
            ) : (
              transacoes.map((t) => (
                <tr key={t.id} className="border-b border-line last:border-0 hover:bg-surface-2/50">
                  <td className="px-4 py-3 text-text-2 text-xs">{formatDate(t.created_at)}</td>
                  <td className="px-4 py-3 font-medium">
                    {t.descricao}
                    {t.origem === 'venda' && (
                      <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[0.6rem] font-medium bg-gold-dim text-gold align-middle">
                        venda
                      </span>
                    )}
                    {t.origem === 'decant' && (
                      <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[0.6rem] font-medium bg-surface-2 text-text-2 border border-line align-middle">
                        decant
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${t.tipo === 'entrada' ? 'bg-up/15 text-up' : 'bg-down/15 text-down'}`}>
                      {t.tipo === 'entrada' ? '↑ Entrada' : '↓ Saída'}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-right font-mono ${t.tipo === 'entrada' ? 'text-up' : 'text-down'}`}>
                    {t.tipo === 'saida' ? '- ' : ''}{formatBRL(t.valor)}
                  </td>
                  <td className="px-4 py-3 text-text-2">{t.categoria || '—'}</td>
                  <td className="px-4 py-3 text-text-2">{t.forma_pagamento || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nova transação">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input label="Descrição" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} required placeholder="Ex: Venda balcão — Kit Trio Karnak" />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Tipo" options={[{ value: 'entrada', label: 'Entrada' }, { value: 'saida', label: 'Saída' }]} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} required />
            <Input label="Valor (R$)" type="number" step="0.01" min="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Categoria" options={categoriaOpts} value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
            <Select label="Forma de pagamento" options={pagamentoOpts} value={form.forma_pagamento} onChange={(e) => setForm({ ...form, forma_pagamento: e.target.value })} />
          </div>
          <Input label="Responsável" value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} />
          <div className="flex justify-end gap-3 mt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit">Salvar</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
