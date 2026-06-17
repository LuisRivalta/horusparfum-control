import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/shared/Icon'
import { Modal } from '@/components/shared/Modal'
import { Button, Input } from '@/components/shared/FormControls'

interface Categoria {
  id: string
  nome: string
  icone: string | null
  created_at: string
}

export function EstCategorias() {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState({ nome: '', icone: '' })

  const ctx = useOutletContext<{ actionSlot: HTMLElement | null } | null>()
  const actionSlot = ctx?.actionSlot ?? null

  async function fetchData() {
    setLoading(true)
    const { data } = await supabase.from('categorias').select('*').order('nome')
    setCategorias(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await supabase.from('categorias').insert({
      nome: form.nome,
      icone: form.icone || null,
    })
    setForm({ nome: '', icone: '' })
    setModalOpen(false)
    fetchData()
  }

  return (
    <div className="flex flex-col gap-5">
      {actionSlot && createPortal(
        <Button onClick={() => setModalOpen(true)}>
          <Icon name="plus" size={16} />
          Nova categoria
        </Button>,
        actionSlot
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {loading ? (
          <p className="text-muted col-span-full text-center py-8">Carregando...</p>
        ) : categorias.length === 0 ? (
          <p className="text-muted col-span-full text-center py-8">Nenhuma categoria cadastrada</p>
        ) : (
          categorias.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-4 border border-line rounded-xl bg-surface hover:bg-surface-2 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-gold-dim flex items-center justify-center">
                <Icon name={c.icone || 'grid'} size={20} gold />
              </div>
              <span className="font-medium">{c.nome}</span>
            </div>
          ))
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nova categoria">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input label="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required placeholder="Ex: Masculino, Feminino, Unissex" />
          <Input label="Ícone" value={form.icone} onChange={(e) => setForm({ ...form, icone: e.target.value })} placeholder="Ex: box, grid (opcional)" />
          <div className="flex justify-end gap-3 mt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit">Salvar</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
