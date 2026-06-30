import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/shared/Icon'
import { Modal } from '@/components/shared/Modal'
import { Button, Input } from '@/components/shared/FormControls'

interface Marca {
  id: string
  nome: string
  created_at: string
}

export function EstMarcas() {
  const [marcas, setMarcas] = useState<Marca[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ nome: '' })

  const ctx = useOutletContext<{ actionSlot: HTMLElement | null } | null>()
  const actionSlot = ctx?.actionSlot ?? null

  async function fetchData() {
    setLoading(true)
    const { data } = await supabase.from('marcas').select('*').order('nome')
    setMarcas(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await supabase.from('marcas').insert({ nome: form.nome })
    setForm({ nome: '' })
    setModalOpen(false)
    fetchData()
  }

  return (
    <div className="flex flex-col gap-5">
      {actionSlot && createPortal(
        <Button onClick={() => setModalOpen(true)}>
          <Icon name="plus" size={16} />
          Nova marca
        </Button>,
        actionSlot
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {loading ? (
          <p className="text-muted col-span-full text-center py-8">Carregando...</p>
        ) : marcas.length === 0 ? (
          <p className="text-muted col-span-full text-center py-8">Nenhuma marca cadastrada</p>
        ) : (
          marcas.map((m) => (
            <div key={m.id} className="flex items-center gap-3 p-4 border border-line rounded-xl bg-surface hover:bg-surface-2 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-gold-dim flex items-center justify-center">
                <Icon name="tag" size={20} gold />
              </div>
              <span className="font-medium">{m.nome}</span>
            </div>
          ))
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nova marca">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input label="Nome" value={form.nome} onChange={(e) => setForm({ nome: e.target.value })} required placeholder="Ex: Lattafa, Armaf" />
          <div className="flex justify-end gap-3 mt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit">Salvar</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
