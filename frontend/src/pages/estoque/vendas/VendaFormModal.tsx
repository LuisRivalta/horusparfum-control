import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Modal } from '@/components/shared/Modal'
import { Button, Input, Select } from '@/components/shared/FormControls'
import { Icon } from '@/components/shared/Icon'
import { formatBRL } from '@/lib/utils'
import { resumoVenda, custoDecantUnitario, type ItemVenda } from '@/lib/vendas'

export interface Canal { id: string; nome: string; taxa_padrao: number }
export interface ProdutoOpt { id: string; nome: string; estoque_atual: number; custo_medio: number | null; preco_referencia: number | null }
export interface FrascoOpt { id: string; produto_id: string; ml_restante: number; ml_total: number; produtos: { nome: string; custo_medio: number | null } | null }
export interface Embalagem { tamanho_ml: number; custo: number }

export interface LinhaForm {
  tipo: 'produto' | 'decant'
  produto_id: string
  frasco_id: string
  ml: string
  quantidade: string
  preco: string
  custo_embalagem: string
}

export interface VendaFormModalProps {
  open: boolean
  mode: 'create' | 'edit'
  vendaId?: string
  onClose: () => void
  onSaved: () => void
}

const LINHA_VAZIA: LinhaForm = {
  tipo: 'produto', produto_id: '', frasco_id: '', ml: '5', quantidade: '1', preco: '', custo_embalagem: '0',
}

export function VendaFormModal({ open, mode, vendaId, onClose, onSaved }: VendaFormModalProps) {
  const { user } = useAuth()
  const [canais, setCanais] = useState<Canal[]>([])
  const [produtos, setProdutos] = useState<ProdutoOpt[]>([])
  const [frascos, setFrascos] = useState<FrascoOpt[]>([])
  const [embalagens, setEmbalagens] = useState<Embalagem[]>([])

  const [titulo, setTitulo] = useState('')
  const [canalId, setCanalId] = useState('')
  const [dataVenda, setDataVenda] = useState('')
  const [formaPagamento, setFormaPagamento] = useState('')
  const [cliente, setCliente] = useState('')
  const [taxa, setTaxa] = useState('')
  const [frete, setFrete] = useState('')
  const [vendaNumero, setVendaNumero] = useState<number | null>(null)
  const [linhas, setLinhas] = useState<LinhaForm[]>([{ ...LINHA_VAZIA }])
  const [submitting, setSubmitting] = useState(false)
  const [loadingData, setLoadingData] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setErro(null)
    setSubmitting(false)

    if (mode === 'create') {
      setTitulo(''); setCanalId(''); setDataVenda(''); setFormaPagamento(''); setCliente('')
      setTaxa(''); setFrete(''); setVendaNumero(null); setLinhas([{ ...LINHA_VAZIA }])
      
      Promise.all([
        supabase.from('canais').select('id, nome, taxa_padrao').eq('ativo', true).order('nome'),
        supabase.from('produtos').select('id, nome, estoque_atual, custo_medio, preco_referencia').order('nome'),
        supabase.from('frascos_abertos').select('id, produto_id, ml_restante, ml_total, produtos(nome, custo_medio)').eq('status', 'ativo'),
        supabase.from('embalagens_decant').select('tamanho_ml, custo').eq('ativo', true),
      ]).then(([c, p, f, e]) => {
        setCanais((c.data as Canal[]) || [])
        setProdutos((p.data as ProdutoOpt[]) || [])
        setFrascos((f.data as unknown as FrascoOpt[]) || [])
        setEmbalagens((e.data as Embalagem[]) || [])
      })
    } else if (mode === 'edit' && vendaId) {
      setLoadingData(true)
      Promise.all([
        supabase.from('canais').select('id, nome, taxa_padrao').eq('ativo', true).order('nome'),
        supabase.from('produtos').select('id, nome, estoque_atual, custo_medio, preco_referencia').order('nome'),
        supabase.from('frascos_abertos').select('id, produto_id, ml_restante, ml_total, produtos(nome, custo_medio)').eq('status', 'ativo'),
        supabase.from('embalagens_decant').select('tamanho_ml, custo').eq('ativo', true),
        supabase.from('vendas').select('*').eq('id', vendaId).single(),
        supabase.from('venda_itens').select('*').eq('venda_id', vendaId),
      ]).then(async ([c, p, f, e, vRes, viRes]) => {
        const canaisData = (c.data as Canal[]) || []
        const prodsData = (p.data as ProdutoOpt[]) || []
        let frascosData = (f.data as unknown as FrascoOpt[]) || []
        const embData = (e.data as Embalagem[]) || []

        setCanais(canaisData)
        setProdutos(prodsData)
        setEmbalagens(embData)

        if (vRes.error || !vRes.data) {
          setErro(vRes.error?.message || 'Venda não encontrada')
          setLoadingData(false)
          return
        }

        const v = vRes.data
        setVendaNumero(v.numero)
        setTitulo(v.titulo || '')
        setCanalId(v.canal_id || '')
        setDataVenda(v.data_venda || '')
        setFormaPagamento(v.forma_pagamento || '')
        setCliente(v.cliente || '')
        setTaxa(v.taxa_total != null ? String(v.taxa_total) : '')
        setFrete(v.frete != null ? String(v.frete) : '')

        const viItems = viRes.data || []
        const decantFrascoIds = viItems.filter(i => i.tipo === 'decant' && i.frasco_id).map(i => i.frasco_id as string)

        if (decantFrascoIds.length > 0) {
          const missingFrascoIds = decantFrascoIds.filter(id => !frascosData.some(fr => fr.id === id))
          if (missingFrascoIds.length > 0) {
            const { data: extraFrascos } = await supabase
              .from('frascos_abertos')
              .select('id, produto_id, ml_restante, ml_total, produtos(nome, custo_medio)')
              .in('id', missingFrascoIds)
            if (extraFrascos && extraFrascos.length > 0) {
              frascosData = [...frascosData, ...(extraFrascos as unknown as FrascoOpt[])]
            }
          }
        }
        setFrascos(frascosData)

        if (viItems.length > 0) {
          const novassLinhas: LinhaForm[] = viItems.map(item => {
            if (item.tipo === 'decant') {
              return {
                tipo: 'decant',
                produto_id: '',
                frasco_id: item.frasco_id || '',
                ml: item.ml != null ? String(item.ml) : '5',
                quantidade: item.quantidade != null ? String(item.quantidade) : '1',
                preco: item.preco_unitario != null ? String(item.preco_unitario) : '',
                custo_embalagem: item.custo_embalagem != null ? String(item.custo_embalagem) : '0',
              }
            } else {
              return {
                tipo: 'produto',
                produto_id: item.produto_id || '',
                frasco_id: '',
                ml: '5',
                quantidade: item.quantidade != null ? String(item.quantidade) : '1',
                preco: item.preco_unitario != null ? String(item.preco_unitario) : '',
                custo_embalagem: '0',
              }
            }
          })
          setLinhas(novassLinhas)
        } else {
          setLinhas([{ ...LINHA_VAZIA }])
        }

        setLoadingData(false)
      })
    }
  }, [open, mode, vendaId])

  function setLinha(index: number, patch: Partial<LinhaForm>) {
    setLinhas(prev => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  function brutoTotal(): number {
    return linhas.reduce((acc, l) => acc + (Number(l.preco) || 0) * (Number(l.quantidade) || 0), 0)
  }

  function onCanalChange(id: string) {
    setCanalId(id)
    const canal = canais.find(c => c.id === id)
    if (canal && taxa === '') {
      const bruto = brutoTotal()
      if (bruto > 0) setTaxa(((bruto * canal.taxa_padrao) / 100).toFixed(2))
    }
  }

  function custoUnitarioDaLinha(l: LinhaForm): number {
    if (l.tipo === 'produto') {
      const p = produtos.find(x => x.id === l.produto_id)
      return p?.custo_medio ?? 0
    }
    const f = frascos.find(x => x.id === l.frasco_id)
    if (!f) return 0
    return custoDecantUnitario(Number(l.ml) || 0, f.produtos?.custo_medio ?? 0, f.ml_total)
  }

  function linhaParaItem(l: LinhaForm): ItemVenda {
    return {
      tipo: l.tipo,
      quantidade: Number(l.quantidade) || 0,
      precoUnitario: Number(l.preco) || 0,
      custoUnitario: custoUnitarioDaLinha(l),
      custoEmbalagem: l.tipo === 'decant' ? (Number(l.custo_embalagem) || 0) : 0,
    }
  }

  const itensPreview = linhas
    .filter(l => (l.tipo === 'produto' ? l.produto_id : l.frasco_id) && l.preco !== '' && Number(l.preco) >= 0)
    .map(linhaParaItem)
  const resumo = resumoVenda(itensPreview, Number(taxa) || 0, Number(frete) || 0)
  const taxaPct = resumo.totalBruto > 0 ? ((Number(taxa) || 0) / resumo.totalBruto) * 100 : 0

  function estoqueDisponivel(l: LinhaForm): string {
    if (l.tipo === 'produto') {
      const p = produtos.find(x => x.id === l.produto_id)
      return p ? `${p.estoque_atual} un.` : ''
    }
    const f = frascos.find(x => x.id === l.frasco_id)
    return f ? `${f.ml_restante} ml` : ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setErro(null)
    if (!canalId) { setErro('Selecione o canal'); return }
    const validas = linhas.filter(l =>
      (l.tipo === 'produto' ? l.produto_id : l.frasco_id) && Number(l.quantidade) >= 1 && Number(l.preco) >= 0 && l.preco !== ''
    )
    if (validas.length === 0) { setErro('Adicione ao menos um item válido (produto/frasco e preço)'); return }
    if (validas.length !== linhas.filter(l => l.produto_id || l.frasco_id || l.preco).length) {
      setErro('Há linhas incompletas — preencha produto/frasco e preço, ou remova a linha'); return
    }

    const itensPayload = validas.map(l => ({
      tipo: l.tipo,
      produto_id: l.tipo === 'produto'
        ? l.produto_id
        : frascos.find(f => f.id === l.frasco_id)?.produto_id,
      frasco_id: l.tipo === 'decant' ? l.frasco_id : null,
      ml: l.tipo === 'decant' ? Number(l.ml) : null,
      quantidade: Number(l.quantidade),
      preco_unitario: Number(l.preco) || 0,
      custo_embalagem: l.tipo === 'decant' ? (Number(l.custo_embalagem) || 0) : 0,
    }))

    setSubmitting(true)
    let res: { error: { message: string } | null }

    if (mode === 'edit') {
      res = await supabase.rpc('editar_venda', {
        p_venda_id: vendaId,
        p_canal_id: canalId,
        p_data_venda: dataVenda || null,
        p_forma_pagamento: formaPagamento || null,
        p_cliente: cliente || null,
        p_taxa_total: Number(taxa) || 0,
        p_frete: Number(frete) || 0,
        p_responsavel: user?.email || null,
        p_observacao: null,
        p_itens: itensPayload,
      })
    } else {
      res = await supabase.rpc('registrar_venda', {
        p_canal_id: canalId,
        p_data_venda: dataVenda || null,
        p_forma_pagamento: formaPagamento || null,
        p_cliente: cliente || null,
        p_taxa_total: Number(taxa) || 0,
        p_frete: Number(frete) || 0,
        p_responsavel: user?.email || null,
        p_observacao: null,
        p_itens: itensPayload,
        p_titulo: titulo || null,
      })
    }

    setSubmitting(false)
    if (res.error) {
      setErro(res.error.message)
      return
    }
    onSaved()
    onClose()
  }

  const modalTitle = mode === 'edit'
    ? (vendaNumero != null ? `Editar venda #${vendaNumero}` : 'Editar venda')
    : 'Nova venda'

  return (
    <Modal open={open} onClose={onClose} title={modalTitle} size="lg">
      {loadingData ? (
        <div className="p-8 text-center text-muted">Carregando dados da venda...</div>
      ) : (
        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Nome da venda (opcional)" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Venda para Gustavo" />
            <Input label="Data da venda" type="date" value={dataVenda} onChange={(e) => setDataVenda(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Canal"
              options={canais.map(c => ({ value: c.id, label: `${c.nome} (${c.taxa_padrao}%)` }))}
              value={canalId}
              onChange={(e) => onCanalChange(e.target.value)}
              required
            />
            <Input label="Cliente (opcional)" value={cliente} onChange={(e) => setCliente(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Forma de pagamento" value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} placeholder="Pix, Cartão…" />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-[.08em] text-muted">Itens</span>

            {linhas.map((l, i) => (
              <div key={i} className="flex flex-col gap-2 p-3 border border-line rounded-lg">
                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                  <Select
                    label="Tipo"
                    options={[{ value: 'produto', label: 'Produto (frasco cheio)' }, { value: 'decant', label: 'Decant' }]}
                    value={l.tipo}
                    onChange={(e) => setLinha(i, { tipo: e.target.value as 'produto' | 'decant', produto_id: '', frasco_id: '' })}
                  />
                  <span className="text-xs text-muted pb-2.5 ml-auto">{estoqueDisponivel(l)}</span>
                  <button
                    type="button"
                    onClick={() => setLinhas(prev => prev.length > 1 ? prev.filter((_, j) => j !== i) : prev)}
                    className="pb-2.5 text-muted hover:text-down cursor-pointer"
                    title="Remover item"
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>

                {l.tipo === 'produto' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_70px_110px] gap-2 items-end">
                    <Select
                      label="Produto"
                      options={produtos.map(p => ({ value: p.id, label: p.nome }))}
                      value={l.produto_id}
                      onChange={(e) => {
                        const p = produtos.find(x => x.id === e.target.value)
                        setLinha(i, { produto_id: e.target.value, preco: l.preco || (p?.preco_referencia != null ? String(p.preco_referencia) : '') })
                      }}
                    />
                    <Input label="Qtd" type="number" min="1" value={l.quantidade} onChange={(e) => setLinha(i, { quantidade: e.target.value })} />
                    <Input label="Preço un." type="number" step="0.01" min="0" value={l.preco} onChange={(e) => setLinha(i, { preco: e.target.value })} />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_60px_70px_100px] gap-2 items-end">
                    <Select
                      label="Frasco aberto"
                      options={frascos.map(f => ({ value: f.id, label: `${f.produtos?.nome} (${f.ml_restante}ml)` }))}
                      value={l.frasco_id}
                      onChange={(e) => setLinha(i, { frasco_id: e.target.value })}
                    />
                    <Input
                      label="ml"
                      type="number" min="1"
                      value={l.ml}
                      onChange={(e) => {
                        const emb = embalagens.find(x => x.tamanho_ml === Number(e.target.value))
                        setLinha(i, { ml: e.target.value, custo_embalagem: emb ? String(emb.custo) : l.custo_embalagem })
                      }}
                    />
                    <Input label="Preço" type="number" step="0.01" min="0" value={l.preco} onChange={(e) => setLinha(i, { preco: e.target.value })} />
                    <Input label="Emb. (R$)" type="number" step="0.01" min="0" value={l.custo_embalagem} onChange={(e) => setLinha(i, { custo_embalagem: e.target.value })} />
                  </div>
                )}
              </div>
            ))}

            <Button type="button" variant="secondary" size="sm" className="self-start"
              onClick={() => setLinhas(prev => [...prev, { ...LINHA_VAZIA }])}>
              <Icon name="plus" size={14} />
              Adicionar item
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Taxa do pedido (R$)" type="number" step="0.01" min="0" value={taxa} onChange={(e) => setTaxa(e.target.value)} />
            <Input label="Frete absorvido (R$)" type="number" step="0.01" min="0" value={frete} onChange={(e) => setFrete(e.target.value)} />
          </div>

          {/* Prévia ao vivo */}
          <div className="flex flex-col gap-1.5 border-t border-line pt-3 text-sm">
            <div className="flex justify-between"><span className="text-muted">Bruto</span><span className="font-mono">{formatBRL(resumo.totalBruto)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Custo</span><span className="font-mono">{formatBRL(resumo.totalCusto)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Receita líquida</span><span className="font-mono">{formatBRL(resumo.receitaLiquida)}</span></div>
            <div className="flex justify-between text-base">
              <span>Lucro</span>
              <span className={`font-mono ${resumo.lucroBruto < 0 ? 'text-down' : 'text-up'}`}>
                {formatBRL(resumo.lucroBruto)} · ROI {resumo.roi === null ? '—' : `${(resumo.roi * 100).toFixed(0)}%`} · Margem {(resumo.margem * 100).toFixed(0)}% · Taxa {taxaPct.toFixed(0)}%
              </span>
            </div>
          </div>

          {erro && (
            <div className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{erro}</div>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? (mode === 'edit' ? 'Salvando...' : 'Registrando...')
                : (mode === 'edit' ? 'Salvar alterações' : 'Registrar venda')}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
