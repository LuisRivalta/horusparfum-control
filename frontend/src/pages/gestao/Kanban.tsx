import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button, Input, Select } from '@/components/shared/FormControls'
import { Modal } from '@/components/shared/Modal'
import { Icon } from '@/components/shared/Icon'
import { cn } from '@/lib/utils'
import { COLUNAS, PRIORIDADES, agrupar, hojeLocal, ordemNoGrupo, situacaoPrazo, type Prioridade, type Status, type Tarefa } from '@/lib/kanban'

const COLS = 'id, titulo, descricao, prazo, status, prioridade, ordem'
const ERRO_SALVAR = 'Não foi possível salvar. Tente de novo.'

interface Form { id: string | null; titulo: string; descricao: string; prazo: string; prioridade: Prioridade }
const VAZIO: Form = { id: null, titulo: '', descricao: '', prazo: '', prioridade: 'media' }

// Cor de cada coluna (kanban de parede): faixa no topo e fundo bem suave.
const COR: Record<Status, { fundo: string; faixa: string }> = {
  a_fazer: { fundo: 'bg-down/[0.05]', faixa: 'bg-down' },
  fazendo: { fundo: 'bg-warn/[0.06]', faixa: 'bg-warn' },
  feito: { fundo: 'bg-up/[0.05]', faixa: 'bg-up' },
}

// Tons neutros de propósito: vermelho/amarelo/verde já são das colunas.
const SELO: Record<Prioridade, { icone: string; classe: string }> = {
  alta: { icone: 'up', classe: 'border-line-2 text-text font-semibold' },
  media: { icone: '', classe: 'border-line text-muted' },
  baixa: { icone: 'down', classe: 'border-line text-faint' },
}

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

export function Kanban() {
  const [tarefas, setTarefas] = useState<Tarefa[] | null>(null)
  const [erro, setErro] = useState('')
  const [form, setForm] = useState<Form | null>(null)
  const [confirmar, setConfirmar] = useState(false)
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [alvo, setAlvo] = useState<Status | null>(null)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('tarefas').select(COLS).order('ordem')
    if (error) { setErro('Não foi possível carregar as tarefas.'); setTarefas([]); return }
    setTarefas(((data ?? []) as Tarefa[]).map((t) => ({ ...t, ordem: Number(t.ordem) })))
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const lista = tarefas ?? []
  const grupos = agrupar(lista)
  const hoje = hojeLocal()

  // Grava e recarrega; erro avisa e volta ao que está no banco.
  async function gravar(fn: () => PromiseLike<{ error: unknown }>) {
    setErro('')
    const { error } = await fn()
    if (error) setErro(ERRO_SALVAR)
    await carregar()
    return !error
  }

  function mover(id: string, status: Status, antesDeId: string | null) {
    const t = lista.find((x) => x.id === id)
    if (!t || (t.status === status && antesDeId === id)) return
    const ordem = ordemNoGrupo(grupos[status], antesDeId, t)
    if (t.status === status && t.ordem === ordem) return
    setTarefas(lista.map((x) => (x.id === id ? { ...x, status, ordem } : x)))
    gravar(() => supabase.from('tarefas').update({ status, ordem }).eq('id', id))
  }

  function soltar(e: React.DragEvent, status: Status, antesDeId: string | null) {
    e.preventDefault()
    e.stopPropagation()
    setAlvo(null)
    if (arrastando) mover(arrastando, status, antesDeId)
    setArrastando(null)
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!form || !form.titulo.trim()) return
    const dados = { titulo: form.titulo.trim(), descricao: form.descricao.trim() || null, prazo: form.prazo || null, prioridade: form.prioridade }
    const ok = form.id
      ? await gravar(() => supabase.from('tarefas').update(dados).eq('id', form.id!))
      : await gravar(() => supabase.from('tarefas').insert({ ...dados, status: 'a_fazer', ordem: ordemNoGrupo(grupos.a_fazer, null, { id: '', prioridade: form.prioridade }) }))
    if (ok) setForm(null)
  }

  async function excluir() {
    if (!form?.id) return
    if (!confirmar) { setConfirmar(true); return }
    if (await gravar(() => supabase.from('tarefas').delete().eq('id', form.id!))) setForm(null)
  }

  const abrir = (f: Form) => { setConfirmar(false); setForm(f) }

  return (
    <div className="page-enter space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold">◆ Gestão / Quadro</p>
          <h1>Quadro</h1>
          <p className="text-sm text-muted">Tarefas da loja. Arraste os cartões entre as colunas.</p>
        </div>
        <Button onClick={() => abrir(VAZIO)}><Icon name="plus" size={14} /> Nova tarefa</Button>
      </header>

      {erro && <div role="alert" className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{erro}</div>}
      {tarefas === null && <p className="text-sm text-muted">Carregando...</p>}

      <div className="grid gap-4 md:grid-cols-3">
        {COLUNAS.map((c, ci) => (
          <section
            key={c.status}
            aria-label={c.titulo}
            onDragOver={(e) => { e.preventDefault(); setAlvo(c.status) }}
            onDragLeave={() => setAlvo((a) => (a === c.status ? null : a))}
            onDrop={(e) => soltar(e, c.status, null)}
            className={cn('border border-line rounded-xl p-3 min-h-[12rem] flex flex-col gap-2 transition-colors', COR[c.status].fundo,
              alvo === c.status && 'ring-2 ring-gold/50')}
          >
            <span aria-hidden className={cn('h-1.5 rounded-full', COR[c.status].faixa)} />
            <h2 className="flex items-center justify-between font-mono text-xs uppercase tracking-[.14em] text-muted px-1 pb-1">
              {c.titulo} <span className="text-faint">{grupos[c.status].length}</span>
            </h2>
            {grupos[c.status].map((t) => {
              const prazo = situacaoPrazo(t, hoje)
              return (
                <article
                  key={t.id}
                  draggable
                  onDragStart={(e) => {
                    setArrastando(t.id)
                    if (!e.dataTransfer) return // jsdom
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', t.id) // sem isso o Firefox não arrasta
                  }}
                  onDragEnd={() => { setArrastando(null); setAlvo(null) }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => soltar(e, c.status, t.id)}
                  className={cn('group bg-surface-2 border border-line rounded-lg p-3 cursor-grab hover:border-line-2',
                    arrastando === t.id && 'opacity-50', prazo === 'atrasado' && 'border-down/60')}
                >
                  <button type="button" className="block w-full text-left cursor-pointer" aria-label={`Editar ${t.titulo}`}
                    onClick={() => abrir({ id: t.id, titulo: t.titulo, descricao: t.descricao ?? '', prazo: t.prazo ?? '', prioridade: t.prioridade })}>
                    <p className="text-sm text-text font-medium break-words">{t.titulo}</p>
                    {t.descricao && <p className="mt-1 text-xs text-muted line-clamp-3 whitespace-pre-line">{t.descricao}</p>}
                  </button>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                    <span className={cn('inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border', SELO[t.prioridade].classe)}>
                      {SELO[t.prioridade].icone ? <Icon name={SELO[t.prioridade].icone} size={11} /> : <span aria-hidden>●</span>}
                      {PRIORIDADES.find((p) => p.valor === t.prioridade)?.titulo}
                    </span>
                    {t.prazo && (
                      <span className={cn('inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border',
                        prazo === 'atrasado' ? 'border-down/50 text-down bg-down/10'
                          : prazo === 'hoje' ? 'border-gold-line text-gold bg-gold/10' : 'border-line text-muted')}>
                        <Icon name="calendar" size={11} /> {ddmm(t.prazo)}
                        {prazo === 'atrasado' && ' · Atrasado'}{prazo === 'hoje' && ' · Hoje'}
                      </span>
                    )}
                    </div>
                    <div className="flex">
                      <Button variant="ghost" size="sm" disabled={ci === 0} aria-label={`Mover ${t.titulo} para ${COLUNAS[ci - 1]?.titulo ?? ''}`}
                        onClick={() => mover(t.id, COLUNAS[ci - 1].status, null)}>
                        <Icon name="chevron" size={14} className="rotate-180" />
                      </Button>
                      <Button variant="ghost" size="sm" disabled={ci === COLUNAS.length - 1} aria-label={`Mover ${t.titulo} para ${COLUNAS[ci + 1]?.titulo ?? ''}`}
                        onClick={() => mover(t.id, COLUNAS[ci + 1].status, null)}>
                        <Icon name="chevron" size={14} />
                      </Button>
                    </div>
                  </div>
                </article>
              )
            })}
            {grupos[c.status].length === 0 && <p className="text-xs text-faint text-center py-6">Nenhuma tarefa.</p>}
          </section>
        ))}
      </div>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Editar tarefa' : 'Nova tarefa'}>
        {form && (
          <form onSubmit={salvar} className="space-y-4">
            <Input label="Título" value={form.titulo} required autoFocus onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-[.08em] text-muted">Descrição</span>
              <textarea rows={4} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-line bg-surface-2 text-text text-sm focus:outline-none focus:border-gold/60" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Prioridade" value={form.prioridade} placeholder={false}
                onChange={(e) => setForm({ ...form, prioridade: e.target.value as Prioridade })}
                options={PRIORIDADES.map((p) => ({ value: p.valor, label: p.titulo }))} />
              <Input label="Prazo" type="date" value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })} />
            </div>
            <div className="flex items-center justify-between gap-2 pt-2">
              {form.id ? (
                <Button type="button" variant="danger" onClick={excluir}>{confirmar ? 'Confirmar exclusão' : 'Excluir'}</Button>
              ) : <span />}
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
                <Button type="submit" disabled={!form.titulo.trim()}>Salvar</Button>
              </div>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
