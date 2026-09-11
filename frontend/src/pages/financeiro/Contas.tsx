import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/shared/Icon'
import { Modal } from '@/components/shared/Modal'
import { Button, Input, Select } from '@/components/shared/FormControls'
import { cn, formatBRL } from '@/lib/utils'

interface Parcela {
  id: string
  numero: number
  valor: number
  vencimento: string | null
  status: 'a_vencer' | 'paga' | 'recebida'
  quitada_em: string | null
}

interface Conta {
  id: string
  tipo: string
  entidade: string | null
  descricao: string | null
  valor: number
  vencimento: string | null
  status: string
  valor_entrada: number
  num_parcelas: number
  created_at: string
  conta_parcelas: Parcela[]
}

interface FinContasProps {
  tipo: 'pagar' | 'receber'
}

interface LinhaPreview {
  label: string
  valor: number
  vencimento: string | null
  quitada: boolean
}

/** Prévia do parcelamento no modal: `null` enquanto não há valor, ou erro, ou as linhas. */
type PreviewParcelas = null | { erro: string } | { linhas: LinhaPreview[] }

/** Situação exibida de uma parcela — `vencida` é derivada da data, não armazenada. */
type Situacao = 'a_vencer' | 'vencida' | 'quitada'

const SITUACAO_CLS: Record<Situacao, string> = {
  a_vencer: 'bg-warn/15 text-warn',
  vencida: 'bg-down/15 text-down',
  quitada: 'bg-up/15 text-up',
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10)
}

function situacaoDe(p: Parcela): Situacao {
  if (p.status !== 'a_vencer') return 'quitada'
  if (p.vencimento && p.vencimento < hoje()) return 'vencida'
  return 'a_vencer'
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')
}

/** Rótulo da parcela: 0 = entrada, 1..N = parcela N/total. */
function labelParcela(p: Parcela, total: number) {
  if (p.numero === 0) return 'Entrada'
  if (total <= 1) return 'Parcela única'
  return `Parcela ${p.numero}/${total}`
}

/**
 * Divide `totalCents` em `n` partes, com o resto do arredondamento na última.
 * Espelha a mesma regra da RPC `criar_conta`.
 */
export function dividirParcelas(totalCents: number, n: number): number[] {
  if (n <= 0 || totalCents <= 0) return []
  const base = Math.floor(totalCents / n)
  const out = Array(n).fill(base)
  out[n - 1] = totalCents - base * (n - 1)
  return out
}

export function somarMeses(iso: string, meses: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const base = new Date(y, m - 1 + meses, 1)
  const ultimoDia = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
  base.setDate(Math.min(d, ultimoDia))
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`
}

const FORM_INICIAL = {
  entidade: '',
  descricao: '',
  valor: '',
  entrada: '',
  entrada_quitada: true,
  data_entrada: hoje(),
  num_parcelas: '1',
  primeiro_vencimento: '',
  intervalo_meses: '1',
  categoria: '',
  forma_pagamento: '',
  responsavel: '',
}

export function FinContas({ tipo }: FinContasProps) {
  const ehReceber = tipo === 'receber'
  const [contas, setContas] = useState<Conta[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set())
  const [baixando, setBaixando] = useState<{ conta: Conta; parcela: Parcela } | null>(null)
  const [dataBaixa, setDataBaixa] = useState(hoje())
  const [formaBaixa, setFormaBaixa] = useState('')
  const [excluindo, setExcluindo] = useState<Conta | null>(null)
  const [parcelaOcupada, setParcelaOcupada] = useState<string | null>(null)

  const [form, setForm] = useState(FORM_INICIAL)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('contas')
      .select('*, conta_parcelas(id, numero, valor, vencimento, status, quitada_em)')
      .eq('tipo', tipo)
      .order('created_at', { ascending: false })
    if (error) setErro(error.message)
    setContas(((data as Conta[]) || []).map((c) => ({
      ...c,
      conta_parcelas: [...(c.conta_parcelas || [])].sort((a, b) => a.numero - b.numero),
    })))
    setLoading(false)
  }, [tipo])

  useEffect(() => { fetchData() }, [fetchData])

  function toggle(id: string) {
    setExpandidas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // --- Preview das parcelas dentro do modal ---------------------------------
  const preview = useMemo<PreviewParcelas>(() => {
    const totalCents = Math.round(Number(form.valor || 0) * 100)
    const entradaCents = Math.round(Number(form.entrada || 0) * 100)
    if (totalCents <= 0) return null
    if (entradaCents < 0 || entradaCents > totalCents) return { erro: 'A entrada não pode ser maior que o valor total.' }

    const restante = totalCents - entradaCents
    const n = restante > 0 ? Number(form.num_parcelas || 0) : 0
    if (restante > 0 && (!Number.isInteger(n) || n < 1)) return { erro: 'Informe ao menos 1 parcela para o saldo restante.' }
    if (n > 120) return { erro: 'Máximo de 120 parcelas.' }

    const valores = dividirParcelas(restante, n)
    if (valores.some((v) => v <= 0)) return { erro: 'Parcelas muito pequenas — reduza o número de parcelas.' }

    const intervalo = Math.max(Number(form.intervalo_meses || 1), 1)
    const linhas = [
      ...(entradaCents > 0
        ? [{ label: 'Entrada', valor: entradaCents / 100, vencimento: form.data_entrada || null, quitada: form.entrada_quitada }]
        : []),
      ...valores.map((v, i) => ({
        label: n === 1 ? 'Parcela única' : `Parcela ${i + 1}/${n}`,
        valor: v / 100,
        vencimento: form.primeiro_vencimento ? somarMeses(form.primeiro_vencimento, i * intervalo) : null,
        quitada: false,
      })),
    ]
    return { linhas }
  }, [form])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting || !preview || 'erro' in preview) return
    setSubmitting(true)
    setErro(null)

    const entrada = Number(form.entrada || 0)
    const { error } = await supabase.rpc('criar_conta', {
      p_tipo: tipo,
      p_entidade: form.entidade || null,
      p_descricao: form.descricao || null,
      p_valor_total: Number(form.valor),
      p_entrada: entrada,
      p_num_parcelas: Number(form.num_parcelas || 1),
      p_primeiro_vencimento: form.primeiro_vencimento || null,
      p_intervalo_meses: Number(form.intervalo_meses || 1),
      p_entrada_quitada: entrada > 0 && form.entrada_quitada,
      p_data_entrada: form.data_entrada || null,
      p_categoria: form.categoria || null,
      p_forma_pagamento: form.forma_pagamento || null,
      p_responsavel: form.responsavel || null,
    })
    setSubmitting(false)
    if (error) { setErro(error.message); return }

    setForm({ ...FORM_INICIAL, data_entrada: hoje() })
    setModalOpen(false)
    fetchData()
  }

  async function confirmarBaixa() {
    if (!baixando || parcelaOcupada) return
    setParcelaOcupada(baixando.parcela.id)
    setErro(null)
    const { error } = await supabase.rpc('baixar_parcela', {
      p_parcela_id: baixando.parcela.id,
      p_data: dataBaixa || null,
      p_forma_pagamento: formaBaixa || null,
      p_responsavel: null,
    })
    setParcelaOcupada(null)
    if (error) { setErro(error.message); return }
    setBaixando(null)
    setFormaBaixa('')
    fetchData()
  }

  async function estornar(parcela: Parcela) {
    if (parcelaOcupada) return
    setParcelaOcupada(parcela.id)
    setErro(null)
    const { error } = await supabase.rpc('estornar_parcela', { p_parcela_id: parcela.id })
    setParcelaOcupada(null)
    if (error) { setErro(error.message); return }
    fetchData()
  }

  async function confirmarExclusao() {
    if (!excluindo || submitting) return
    setSubmitting(true)
    setErro(null)
    const { error } = await supabase.rpc('excluir_conta', { p_conta_id: excluindo.id })
    setSubmitting(false)
    if (error) { setErro(error.message); return }
    setExcluindo(null)
    fetchData()
  }

  // --- Totais do topo -------------------------------------------------------
  const resumo = useMemo(() => {
    let total = 0, quitado = 0, vencido = 0
    for (const c of contas) {
      for (const p of c.conta_parcelas) {
        total += Number(p.valor)
        if (p.status !== 'a_vencer') quitado += Number(p.valor)
        else if (p.vencimento && p.vencimento < hoje()) vencido += Number(p.valor)
      }
    }
    return { total, quitado, aberto: total - quitado, vencido }
  }, [contas])

  const verboQuitar = ehReceber ? 'Receber' : 'Pagar'
  const labelQuitada = ehReceber ? 'Recebida' : 'Paga'

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold">Financeiro</p>
          <h1 className="text-3xl font-medium tracking-tight mt-1">Contas a {tipo}</h1>
          <p className="text-muted text-sm mt-1">{ehReceber ? 'Valores a receber, à vista ou parcelados' : 'Obrigações pendentes, à vista ou parceladas'}</p>
        </div>
        <Button onClick={() => { setForm({ ...FORM_INICIAL, data_entrada: hoje() }); setModalOpen(true) }}>
          <Icon name="plus" size={16} />
          Nova conta
        </Button>
      </div>

      {erro && (
        <div className="rounded-lg border border-down/30 bg-down/10 px-4 py-3 text-sm text-down">{erro}</div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total', valor: resumo.total, cls: 'text-text' },
          { label: 'Em aberto', valor: resumo.aberto, cls: 'text-warn' },
          { label: 'Vencido', valor: resumo.vencido, cls: 'text-down' },
          { label: labelQuitada + 's', valor: resumo.quitado, cls: 'text-up' },
        ].map((k) => (
          <div key={k.label} className="border border-line rounded-xl bg-surface px-4 py-3">
            <p className="text-xs uppercase tracking-[.08em] text-muted">{k.label}</p>
            <p className={cn('font-mono text-lg mt-1', k.cls)}>{formatBRL(k.valor)}</p>
          </div>
        ))}
      </div>

      <div className="border border-line rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line bg-surface">
                <th className="w-9 px-2 py-3" />
                <th className="text-left px-4 py-3 text-text-2 font-medium">{ehReceber ? 'Cliente' : 'Fornecedor'}</th>
                <th className="text-left px-4 py-3 text-text-2 font-medium">Descrição</th>
                <th className="text-right px-4 py-3 text-text-2 font-medium">Total</th>
                <th className="text-right px-4 py-3 text-text-2 font-medium">Saldo</th>
                <th className="text-left px-4 py-3 text-text-2 font-medium">Próx. venc.</th>
                <th className="text-left px-4 py-3 text-text-2 font-medium">Progresso</th>
                <th className="w-12 px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">Carregando...</td></tr>
              ) : contas.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">Nenhuma conta cadastrada</td></tr>
              ) : (
                contas.map((c) => {
                  const parcelas = c.conta_parcelas
                  const quitadas = parcelas.filter((p) => p.status !== 'a_vencer')
                  const abertas = parcelas.filter((p) => p.status === 'a_vencer')
                  const saldo = abertas.reduce((s, p) => s + Number(p.valor), 0)
                  const proximo = abertas
                    .map((p) => p.vencimento)
                    .filter((v): v is string => !!v)
                    .sort()[0] || null
                  const temVencida = abertas.some((p) => p.vencimento && p.vencimento < hoje())
                  const aberta = expandidas.has(c.id)

                  return [
                    <tr
                      key={c.id}
                      onClick={() => toggle(c.id)}
                      className="border-b border-line last:border-0 hover:bg-surface-2/50 cursor-pointer"
                    >
                      <td className="px-2 py-3 text-muted">
                        <Icon name="chevron" size={14} className={cn('transition-transform', aberta && 'rotate-90')} />
                      </td>
                      <td className="px-4 py-3 font-medium">{c.entidade || '—'}</td>
                      <td className="px-4 py-3 text-text-2">
                        {c.descricao || '—'}
                        {c.valor_entrada > 0 && (
                          <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[0.6rem] font-medium bg-gold-dim text-gold align-middle">
                            entrada {formatBRL(c.valor_entrada)}
                          </span>
                        )}
                        {c.num_parcelas > 1 && (
                          <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[0.6rem] font-medium bg-surface-2 text-text-2 border border-line align-middle">
                            {c.num_parcelas}x
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{formatBRL(c.valor)}</td>
                      <td className={cn('px-4 py-3 text-right font-mono', saldo === 0 ? 'text-up' : temVencida ? 'text-down' : 'text-warn')}>
                        {formatBRL(saldo)}
                      </td>
                      <td className="px-4 py-3 text-text-2">{formatDate(proximo)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 rounded-full bg-surface-2 overflow-hidden">
                            <div
                              className="h-full bg-up rounded-full transition-all"
                              style={{ width: `${parcelas.length ? (quitadas.length / parcelas.length) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted font-mono">{quitadas.length}/{parcelas.length}</span>
                        </div>
                      </td>
                      <td className="px-2 py-3 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Excluir conta ${c.descricao || c.entidade || ''}`}
                          title="Excluir conta"
                          onClick={(e) => { e.stopPropagation(); setExcluindo(c) }}
                        >
                          <Icon name="trash" size={14} />
                        </Button>
                      </td>
                    </tr>,

                    aberta && (
                      <tr key={`${c.id}-parcelas`} className="border-b border-line last:border-0 bg-surface/60">
                        <td />
                        <td colSpan={7} className="px-4 py-3">
                          <ul className="flex flex-col gap-1.5">
                            {parcelas.map((p) => {
                              const sit = situacaoDe(p)
                              return (
                                <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-line bg-surface-2/40 px-3 py-2">
                                  <span className="min-w-[7.5rem] text-xs font-medium text-text-2">{labelParcela(p, c.num_parcelas)}</span>
                                  <span className="min-w-[5.5rem] text-xs text-muted">{formatDate(p.vencimento)}</span>
                                  <span className="min-w-[5.5rem] font-mono text-sm">{formatBRL(p.valor)}</span>
                                  <span className={cn('inline-flex px-2 py-0.5 rounded text-xs font-medium', SITUACAO_CLS[sit])}>
                                    {sit === 'quitada' ? labelQuitada : sit === 'vencida' ? 'Vencida' : 'A vencer'}
                                  </span>
                                  <div className="ml-auto">
                                    {sit === 'quitada' ? (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={parcelaOcupada === p.id}
                                        title="Estornar (remove a transação gerada)"
                                        onClick={() => estornar(p)}
                                      >
                                        <Icon name="swap" size={14} />
                                        Estornar
                                      </Button>
                                    ) : (
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        disabled={parcelaOcupada === p.id}
                                        onClick={() => { setBaixando({ conta: c, parcela: p }); setDataBaixa(hoje()); setFormaBaixa('') }}
                                      >
                                        <Icon name="check" size={14} />
                                        {verboQuitar}
                                      </Button>
                                    )}
                                  </div>
                                </li>
                              )
                            })}
                          </ul>
                        </td>
                      </tr>
                    ),
                  ]
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ------------------------------ Nova conta ------------------------------ */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={`Nova conta a ${tipo}`} size="lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={ehReceber ? 'Cliente' : 'Fornecedor'}
              value={form.entidade}
              onChange={(e) => setForm({ ...form, entidade: e.target.value })}
            />
            <Input label="Descrição" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Ex: Perfume 100ml" />
          </div>

          <Input
            label="Valor total (R$)"
            type="number" step="0.01" min="0.01"
            value={form.valor}
            onChange={(e) => setForm({ ...form, valor: e.target.value })}
            required
          />

          <fieldset className="rounded-xl border border-line p-4 flex flex-col gap-3">
            <legend className="px-2 text-xs font-medium uppercase tracking-[.08em] text-muted">Entrada (opcional)</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Valor da entrada (R$)"
                type="number" step="0.01" min="0"
                value={form.entrada}
                onChange={(e) => setForm({ ...form, entrada: e.target.value })}
                placeholder="0,00"
              />
              <Input
                label="Data da entrada"
                type="date"
                value={form.data_entrada}
                onChange={(e) => setForm({ ...form, data_entrada: e.target.value })}
                disabled={!Number(form.entrada)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-text-2 cursor-pointer">
              <input
                type="checkbox"
                className="accent-gold"
                checked={form.entrada_quitada}
                disabled={!Number(form.entrada)}
                onChange={(e) => setForm({ ...form, entrada_quitada: e.target.checked })}
              />
              Entrada já {ehReceber ? 'recebida' : 'paga'} (lança a transação no financeiro)
            </label>
          </fieldset>

          <fieldset className="rounded-xl border border-line p-4 flex flex-col gap-3">
            <legend className="px-2 text-xs font-medium uppercase tracking-[.08em] text-muted">Parcelamento do saldo</legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                label="Nº de parcelas"
                type="number" min="1" max="120" step="1"
                value={form.num_parcelas}
                onChange={(e) => setForm({ ...form, num_parcelas: e.target.value })}
              />
              <Input
                label="1º vencimento"
                type="date"
                value={form.primeiro_vencimento}
                onChange={(e) => setForm({ ...form, primeiro_vencimento: e.target.value })}
              />
              <Select
                label="Intervalo"
                options={[
                  { value: '1', label: 'Mensal' },
                  { value: '2', label: 'Bimestral' },
                  { value: '3', label: 'Trimestral' },
                  { value: '6', label: 'Semestral' },
                  { value: '12', label: 'Anual' },
                ]}
                value={form.intervalo_meses}
                onChange={(e) => setForm({ ...form, intervalo_meses: e.target.value })}
              />
            </div>
          </fieldset>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Categoria" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder={ehReceber ? 'Vendas' : 'Fornecedores'} />
            <Input label="Forma de pagamento" value={form.forma_pagamento} onChange={(e) => setForm({ ...form, forma_pagamento: e.target.value })} placeholder="Pix" />
            <Input label="Responsável" value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} />
          </div>

          {preview && 'erro' in preview && (
            <p className="text-sm text-down">{preview.erro}</p>
          )}

          {preview && 'linhas' in preview && (
            <div className="rounded-xl border border-line overflow-hidden">
              <p className="bg-surface-2 px-3 py-2 text-xs font-medium uppercase tracking-[.08em] text-muted">
                Prévia — {preview.linhas.length} lançamento{preview.linhas.length > 1 ? 's' : ''}
              </p>
              <ul className="divide-y divide-line max-h-56 overflow-y-auto">
                {preview.linhas.map((l, i) => (
                  <li key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="min-w-[7.5rem] text-text-2">{l.label}</span>
                    <span className="min-w-[5.5rem] text-muted text-xs">{formatDate(l.vencimento)}</span>
                    <span className="ml-auto font-mono">{formatBRL(l.valor)}</span>
                    {l.quitada && <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-up/15 text-up">{labelQuitada}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end mt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={submitting || !preview || 'erro' in preview}>
              {submitting ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ------------------------------ Baixa ------------------------------ */}
      <Modal open={!!baixando} onClose={() => setBaixando(null)} title={`${verboQuitar} parcela`} size="sm">
        {baixando && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text-2">
              {labelParcela(baixando.parcela, baixando.conta.num_parcelas)} de{' '}
              <strong>{formatBRL(baixando.parcela.valor)}</strong>
              {baixando.conta.entidade ? ` — ${baixando.conta.entidade}` : ''}.
            </p>
            <p className="text-xs text-muted">
              Será lançada uma transação de {ehReceber ? 'entrada' : 'saída'} no financeiro na data informada.
            </p>
            <Input label="Data" type="date" value={dataBaixa} onChange={(e) => setDataBaixa(e.target.value)} />
            <Input label="Forma de pagamento" value={formaBaixa} onChange={(e) => setFormaBaixa(e.target.value)} placeholder="Pix" />
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end mt-2">
              <Button type="button" variant="secondary" onClick={() => setBaixando(null)}>Cancelar</Button>
              <Button onClick={confirmarBaixa} disabled={parcelaOcupada === baixando.parcela.id}>Confirmar</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ------------------------------ Exclusão ------------------------------ */}
      <Modal open={!!excluindo} onClose={() => setExcluindo(null)} title="Excluir conta" size="sm">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-2">
            Excluir <strong>{excluindo?.descricao || excluindo?.entidade || 'esta conta'}</strong> e todas as suas parcelas?
          </p>
          <p className="text-xs text-muted">
            As transações já lançadas por parcelas quitadas também serão removidas do financeiro.
          </p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end mt-2">
            <Button type="button" variant="secondary" onClick={() => setExcluindo(null)}>Cancelar</Button>
            <Button variant="danger" onClick={confirmarExclusao} disabled={submitting}>Excluir</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
