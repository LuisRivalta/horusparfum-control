import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/shared/Icon'
import { Modal } from '@/components/shared/Modal'
import { Button, Input, Select } from '@/components/shared/FormControls'

interface Fornecedor {
  id: string
  nome: string
  contato: string | null
  status: string
  ultima_compra: string | null
  created_at: string
}

export function EstFornecedores() {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState({ nome: '', contato: '', status: 'ativo' })

  const ctx = useOutletContext<{ actionSlot: HTMLElement | null } | null>()
  const actionSlot = ctx?.actionSlot ?? null

  async function fetchData() {
    setLoading(true)
    const { data } = await supabase.from('fornecedores').select('*').order('nome')
    setFornecedores(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await supabase.from('fornecedores').insert({
      nome: form.nome,
      contato: form.contato || null,
      status: form.status,
    })
    setForm({ nome: '', contato: '', status: 'ativo' })
    setModalOpen(false)
    fetchData()
  }

  function formatDate(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')
  }

  return (
    <div className="flex flex-col gap-5">
      {actionSlot && createPortal(
        <Button onClick={() => setModalOpen(true)}>
          <Icon name="plus" size={16} />
          Novo fornecedor
        </Button>,
        actionSlot
      )}

      <div className="border border-line rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface">
              <th className="text-left px-4 py-3 text-text-2 font-medium">Nome</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Contato</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Status</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Última compra</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">Carregando...</td></tr>
            ) : fornecedores.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">Nenhum fornecedor cadastrado</td></tr>
            ) : (
              fornecedores.map((f) => (
                <tr key={f.id} className="border-b border-line last:border-0 hover:bg-surface-2/50">
                  <td className="px-4 py-3 font-medium">{f.nome}</td>
                  <td className="px-4 py-3 text-text-2">{f.contato || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${f.status === 'ativo' ? 'bg-up/15 text-up' : 'bg-down/15 text-down'}`}>
                      {f.status === 'ativo' ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-2">{formatDate(f.ultima_compra)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo fornecedor">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input label="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required placeholder="Razão social ou nome fantasia" />
          <Input label="Contato" value={form.contato} onChange={(e) => setForm({ ...form, contato: e.target.value })} placeholder="Email ou telefone" />
          <Select label="Status" options={[{ value: 'ativo', label: 'Ativo' }, { value: 'inativo', label: 'Inativo' }]} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} />
          <div className="flex justify-end gap-3 mt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit">Salvar</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
