import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/shared/Icon'
import { Modal } from '@/components/shared/Modal'
import { Button, Input, Select } from '@/components/shared/FormControls'
import { formatBRL } from '@/lib/utils'

interface Conta {
  id: string
  tipo: string
  entidade: string | null
  descricao: string | null
  valor: number
  vencimento: string | null
  status: string
  created_at: string
}

interface FinContasProps {
  tipo: 'pagar' | 'receber'
}

export function FinContas({ tipo }: FinContasProps) {
  const [contas, setContas] = useState<Conta[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState({
    entidade: '',
    descricao: '',
    valor: '',
    vencimento: '',
    status: 'a_vencer',
  })

  async function fetchData() {
    setLoading(true)
    const { data } = await supabase
      .from('contas')
      .select('*')
      .eq('tipo', tipo)
      .order('vencimento', { ascending: true })
    setContas(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [tipo])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await supabase.from('contas').insert({
      tipo,
      entidade: form.entidade || null,
      descricao: form.descricao || null,
      valor: Number(form.valor),
      vencimento: form.vencimento || null,
      status: form.status,
    })
    setForm({ entidade: '', descricao: '', valor: '', vencimento: '', status: 'a_vencer' })
    setModalOpen(false)
    fetchData()
  }

  function formatDate(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')
  }

  const statusLabel: Record<string, string> = {
    a_vencer: 'A vencer',
    vencida: 'Vencida',
    paga: 'Paga',
    recebida: 'Recebida',
  }

  const statusColor: Record<string, string> = {
    a_vencer: 'bg-warn/15 text-warn',
    vencida: 'bg-down/15 text-down',
    paga: 'bg-up/15 text-up',
    recebida: 'bg-up/15 text-up',
  }

  const statusOpts = tipo === 'pagar'
    ? [{ value: 'a_vencer', label: 'A vencer' }, { value: 'vencida', label: 'Vencida' }, { value: 'paga', label: 'Paga' }]
    : [{ value: 'a_vencer', label: 'A vencer' }, { value: 'vencida', label: 'Vencida' }, { value: 'recebida', label: 'Recebida' }]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold">Financeiro</p>
          <h1 className="text-3xl font-medium tracking-tight mt-1">Contas a {tipo}</h1>
          <p className="text-muted text-sm mt-1">{tipo === 'pagar' ? 'Obrigações pendentes' : 'Valores a receber'}</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Icon name="plus" size={16} />
          Nova conta
        </Button>
      </div>

      <div className="border border-line rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface">
              <th className="text-left px-4 py-3 text-text-2 font-medium">Entidade</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Descrição</th>
              <th className="text-right px-4 py-3 text-text-2 font-medium">Valor</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Vencimento</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">Carregando...</td></tr>
            ) : contas.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">Nenhuma conta cadastrada</td></tr>
            ) : (
              contas.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0 hover:bg-surface-2/50">
                  <td className="px-4 py-3 font-medium">{c.entidade || '—'}</td>
                  <td className="px-4 py-3 text-text-2">{c.descricao || '—'}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatBRL(c.valor)}</td>
                  <td className="px-4 py-3 text-text-2">{formatDate(c.vencimento)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColor[c.status] || ''}`}>
                      {statusLabel[c.status] || c.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={`Nova conta a ${tipo}`}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input label="Entidade" value={form.entidade} onChange={(e) => setForm({ ...form, entidade: e.target.value })} placeholder={tipo === 'pagar' ? 'Fornecedor' : 'Cliente'} />
          <Input label="Descrição" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Valor (R$)" type="number" step="0.01" min="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} required />
            <Input label="Vencimento" type="date" value={form.vencimento} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} />
          </div>
          <Select label="Status" options={statusOpts} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} />
          <div className="flex justify-end gap-3 mt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit">Salvar</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
