import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/shared/Icon'
import { Modal } from '@/components/shared/Modal'
import { Button, Input } from '@/components/shared/FormControls'
import type { TipoProduto } from '@/lib/tipos'

const FORM_VAZIO = { nome: '', vende_decant: false }

export function EstTiposProduto() {
  const [tipos, setTipos] = useState<TipoProduto[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(FORM_VAZIO)
  const [editing, setEditing] = useState<TipoProduto | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const ctx = useOutletContext<{ actionSlot: HTMLElement | null } | null>()
  const actionSlot = ctx?.actionSlot ?? null

  async function fetchData() {
    setLoading(true)
    const { data } = await supabase.from('tipos_produto').select('*').order('nome')
    setTipos(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  function openCreateModal() {
    setEditing(null)
    setForm(FORM_VAZIO)
    setErro(null)
    setModalOpen(true)
  }

  function openEditModal(t: TipoProduto) {
    setEditing(t)
    setForm({ nome: t.nome, vende_decant: t.vende_decant })
    setErro(null)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
    setForm(FORM_VAZIO)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const { error } = editing
      ? await supabase.from('tipos_produto').update(form).eq('id', editing.id)
      : await supabase.from('tipos_produto').insert(form)
    if (error) { setErro(error.message); return }
    closeModal()
    fetchData()
  }

  return (
    <div className="flex flex-col gap-5">
      {actionSlot && createPortal(
        <Button onClick={openCreateModal}>
          <Icon name="plus" size={16} />
          Novo tipo
        </Button>,
        actionSlot
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {loading ? (
          <p className="text-muted col-span-full text-center py-8">Carregando...</p>
        ) : tipos.length === 0 ? (
          <p className="text-muted col-span-full text-center py-8">Nenhum tipo cadastrado</p>
        ) : (
          tipos.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 p-4 border border-line rounded-xl bg-surface hover:bg-surface-2 transition-colors">
              <div className="flex min-w-0 items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gold-dim flex items-center justify-center">
                  <Icon name="tag" size={20} gold />
                </div>
                <div className="min-w-0">
                  <span className="font-medium truncate block">{t.nome}</span>
                  <span className="text-xs text-muted">Vende em decant: {t.vende_decant ? 'sim' : 'não'}</span>
                </div>
              </div>
              <Button type="button" variant="ghost" size="sm" aria-label={`Editar ${t.nome}`} onClick={() => openEditModal(t)}>
                <Icon name="edit" size={15} />
                Editar
              </Button>
            </div>
          ))
        )}
      </div>

      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Editar tipo' : 'Novo tipo'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {erro && <div className="px-3 py-2 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{erro}</div>}
          <Input label="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required placeholder="Ex.: Perfume" />
          <label className="flex items-center gap-2 text-sm text-text-2">
            <input type="checkbox" checked={form.vende_decant} onChange={(e) => setForm({ ...form, vende_decant: e.target.checked })} />
            Vende em decant
          </label>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end mt-2">
            <Button type="button" variant="secondary" onClick={closeModal}>Cancelar</Button>
            <Button type="submit">Salvar</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
