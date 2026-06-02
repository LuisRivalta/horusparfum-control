import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/shared/Icon'
import { Modal } from '@/components/shared/Modal'
import { Button, Input } from '@/components/shared/FormControls'
import { formatBRL } from '@/lib/utils'

interface Meta {
  id: string
  label: string
  valor_atual: number
  valor_alvo: number
  sufixo: string
  periodo: string | null
  created_at: string
}

export function FinMetas() {
  const [metas, setMetas] = useState<Meta[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState({
    label: '',
    valor_atual: '0',
    valor_alvo: '',
    sufixo: '',
    periodo: '',
  })

  async function fetchData() {
    setLoading(true)
    const { data } = await supabase.from('metas').select('*').order('created_at', { ascending: false })
    setMetas(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await supabase.from('metas').insert({
      label: form.label,
      valor_atual: Number(form.valor_atual),
      valor_alvo: Number(form.valor_alvo),
      sufixo: form.sufixo || '',
      periodo: form.periodo || null,
    })
    setForm({ label: '', valor_atual: '0', valor_alvo: '', sufixo: '', periodo: '' })
    setModalOpen(false)
    fetchData()
  }

  function getProgress(atual: number, alvo: number) {
    if (alvo === 0) return 0
    return Math.min((atual / alvo) * 100, 100)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold">Financeiro</p>
          <h1 className="text-3xl font-medium tracking-tight mt-1">Metas financeiras</h1>
          <p className="text-muted text-sm mt-1">Acompanhamento do trimestre</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Icon name="plus" size={16} />
          Nova meta
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading ? (
          <p className="text-muted col-span-full text-center py-8">Carregando...</p>
        ) : metas.length === 0 ? (
          <p className="text-muted col-span-full text-center py-8">Nenhuma meta cadastrada</p>
        ) : (
          metas.map((m) => {
            const pct = getProgress(m.valor_atual, m.valor_alvo)
            return (
              <div key={m.id} className="p-5 border border-line rounded-xl bg-surface">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium">{m.label}</span>
                  {m.periodo && <span className="text-xs text-muted bg-surface-2 px-2 py-0.5 rounded">{m.periodo}</span>}
                </div>
                <div className="flex items-end justify-between mb-2">
                  <span className="text-2xl font-semibold font-mono">
                    {m.sufixo === '%' ? `${m.valor_atual}%` : formatBRL(m.valor_atual)}
                  </span>
                  <span className="text-sm text-muted">
                    / {m.sufixo === '%' ? `${m.valor_alvo}%` : formatBRL(m.valor_alvo)}
                  </span>
                </div>
                <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gold rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-muted mt-1.5">{pct.toFixed(0)}% alcançado</p>
              </div>
            )
          })
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nova meta">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input label="Label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required placeholder="Ex: Receita mensal" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Valor atual" type="number" step="0.01" value={form.valor_atual} onChange={(e) => setForm({ ...form, valor_atual: e.target.value })} />
            <Input label="Valor alvo" type="number" step="0.01" value={form.valor_alvo} onChange={(e) => setForm({ ...form, valor_alvo: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Sufixo" value={form.sufixo} onChange={(e) => setForm({ ...form, sufixo: e.target.value })} placeholder="%, R$, etc" />
            <Input label="Período" value={form.periodo} onChange={(e) => setForm({ ...form, periodo: e.target.value })} placeholder="Ex: 2026-Q2" />
          </div>
          <div className="flex justify-end gap-3 mt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit">Salvar</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
