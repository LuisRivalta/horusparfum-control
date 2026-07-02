import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Modal } from '@/components/shared/Modal'
import { Button, Input, Select } from '@/components/shared/FormControls'
import { Icon } from '@/components/shared/Icon'
import { formatBRL } from '@/lib/utils'
import { calcularTotalPedido } from '@/lib/pedidos'
import { casarItemImportado, importarPedidoPdf, type MatchStatus } from '@/lib/pedidoPdfImport'

interface Opcao { id: string; nome: string }

interface ItemForm {
  produto_id: string
  qtd: string
  preco: string
  importado_nome?: string
  importado_codigo?: string | null
  matchStatus?: MatchStatus
}

interface ItensOriginal {
  produto_id: string
  qtd_pedida: number
  preco_unitario: number
}

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  pedidoParaEditar?: {
    id: string
    numero: number
    fornecedor_id: string
    previsao_chegada: string | null
    valor_total: number
    frete?: number
  }
}

const ITEM_VAZIO: ItemForm = { produto_id: '', qtd: '1', preco: '' }

function formatarErroSalvarPedido(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Erro ao salvar pedido'
  const normalizado = message.toLowerCase()
  const erroFrete = normalizado.includes('frete') && (
    normalizado.includes('schema cache') ||
    normalizado.includes('could not find') ||
    normalizado.includes('column') ||
    normalizado.includes('does not exist')
  )

  if (erroFrete) {
    return 'Aplique a migration de frete supabase/migrations/20260702142406_frete_pedidos.sql no Supabase SQL Editor e tente novamente.'
  }

  return message
}

export function NovoPedidoModal({ open, onClose, onSaved, pedidoParaEditar }: Props) {
  const { user } = useAuth()
  const [fornecedores, setFornecedores] = useState<Opcao[]>([])
  const [produtos, setProdutos] = useState<Opcao[]>([])
  const [categorias, setCategorias] = useState<Opcao[]>([])
  const [fornecedorId, setFornecedorId] = useState('')
  const [previsao, setPrevisao] = useState('')
  const [frete, setFrete] = useState('')
  const [itens, setItens] = useState<ItemForm[]>([{ ...ITEM_VAZIO }])
  const [submitting, setSubmitting] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [itensOriginais, setItensOriginais] = useState<ItensOriginal[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importandoPdf, setImportandoPdf] = useState(false)

  // cadastro rápido de produto
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickNome, setQuickNome] = useState('')
  const [quickVolume, setQuickVolume] = useState('')
  const [quickCategoria, setQuickCategoria] = useState('')

  useEffect(() => {
    if (!open) return
    Promise.all([
      supabase.from('fornecedores').select('id, nome').order('nome'),
      supabase.from('produtos').select('id, nome').order('nome'),
      supabase.from('categorias').select('id, nome').order('nome'),
    ]).then(([f, p, c]) => {
      setFornecedores(f.data || [])
      setProdutos(p.data || [])
      setCategorias(c.data || [])
    })

    if (pedidoParaEditar) {
      setFornecedorId(pedidoParaEditar.fornecedor_id)
      setPrevisao(pedidoParaEditar.previsao_chegada || '')
      setFrete(String(pedidoParaEditar.frete ?? 0))
      supabase
        .from('pedido_itens')
        .select('produto_id, qtd_pedida, preco_unitario')
        .eq('pedido_id', pedidoParaEditar.id)
        .then(({ data }) => {
          const items = (data as ItensOriginal[]) || []
          setItensOriginais(items)
          setItens(
            items.length > 0
              ? items.map(i => ({
                  produto_id: i.produto_id,
                  qtd: String(i.qtd_pedida),
                  preco: String(i.preco_unitario),
                }))
              : [{ ...ITEM_VAZIO }]
          )
        })
    } else {
      setFornecedorId('')
      setPrevisao('')
      setFrete('')
      setItens([{ ...ITEM_VAZIO }])
      setItensOriginais([])
    }
  }, [open, pedidoParaEditar?.id, pedidoParaEditar?.frete])

  const duplicado = itens.some(
    (item, i) => item.produto_id && itens.findIndex(o => o.produto_id === item.produto_id) !== i
  )

  const itensTotalizaveis = itens.map(i => ({ qtd: Number(i.qtd) || 0, preco: Number(i.preco) || 0 }))
  const freteValor = Math.max(Number(frete) || 0, 0)
  const total = calcularTotalPedido(itensTotalizaveis, freteValor)

  function setItem(index: number, patch: Partial<ItemForm>) {
    setItens(prev => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)))
  }

  async function cadastrarProdutoRapido() {
    if (!quickNome.trim()) return
    const { data, error } = await supabase
      .from('produtos')
      .insert({
        nome: quickNome.trim(),
        volume_ml: quickVolume ? Number(quickVolume) : null,
        categoria_id: quickCategoria || null,
        estoque_atual: 0,
        estoque_minimo: 0,
      })
      .select()
      .single()
    if (error) {
      setErro(`Falha ao cadastrar produto: ${error.message}`)
      return
    }
    if (data) {
      setErro(null)
      setProdutos(prev => [...prev, { id: data.id, nome: quickNome.trim() }])
      setQuickNome('')
      setQuickVolume('')
      setQuickCategoria('')
      setQuickOpen(false)
    }
  }

  async function handlePdfFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || importandoPdf) return

    setErro(null)
    setImportandoPdf(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Sessão expirada. Faça login novamente.')

      const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '')
      const resultado = await importarPedidoPdf({ file, token, apiUrl })
      if (resultado.itens.length === 0) throw new Error('Nenhum item encontrado no PDF')

      setItens(resultado.itens.map(item => casarItemImportado(item, produtos)))
      if (resultado.avisos.length > 0) {
        setErro(resultado.avisos.join(' '))
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao importar PDF')
    } finally {
      setImportandoPdf(false)
    }
  }

  async function handleCreateSubmit(validos: ItemForm[]) {
    const freteValor = Math.max(Number(frete) || 0, 0)
    const { data: pedido, error } = await supabase
      .from('pedidos')
      .insert({
        fornecedor_id: fornecedorId,
        previsao_chegada: previsao || null,
        frete: freteValor,
        valor_total: calcularTotalPedido(validos.map(i => ({ qtd: Number(i.qtd), preco: Number(i.preco) || 0 })), freteValor),
        responsavel: user?.email || null,
      })
      .select()
      .single()
    if (error || !pedido) throw new Error(error?.message || 'Falha ao criar pedido')

    const { error: itensError } = await supabase.from('pedido_itens').insert(
      validos.map(i => ({
        pedido_id: pedido.id,
        produto_id: i.produto_id,
        qtd_pedida: Number(i.qtd),
        preco_unitario: Number(i.preco) || 0,
      }))
    )
    if (itensError) {
      await supabase.from('pedidos').delete().eq('id', pedido.id)
      throw new Error(itensError.message)
    }
  }

  async function handleEditSubmit(validos: ItemForm[]) {
    const freteValor = Math.max(Number(frete) || 0, 0)
    const valor_total = calcularTotalPedido(
      validos.map(i => ({ qtd: Number(i.qtd), preco: Number(i.preco) || 0 })),
      freteValor
    )

    const { error: updateError } = await supabase
      .from('pedidos')
      .update({ fornecedor_id: fornecedorId, previsao_chegada: previsao || null, frete: freteValor, valor_total })
      .eq('id', pedidoParaEditar!.id)
      .eq('status', 'aguardando')
    if (updateError) throw new Error(updateError.message)

    const { error: deleteError } = await supabase
      .from('pedido_itens')
      .delete()
      .eq('pedido_id', pedidoParaEditar!.id)
    if (deleteError) {
      // UPDATE já aconteceu mas itens ainda existem — reverte UPDATE
      await supabase
        .from('pedidos')
        .update({
          fornecedor_id: pedidoParaEditar!.fornecedor_id,
          previsao_chegada: pedidoParaEditar!.previsao_chegada,
          frete: pedidoParaEditar!.frete ?? 0,
          valor_total: pedidoParaEditar!.valor_total,
        })
        .eq('id', pedidoParaEditar!.id)
      throw new Error(deleteError.message)
    }

    const { error: insertError } = await supabase.from('pedido_itens').insert(
      validos.map(i => ({
        pedido_id: pedidoParaEditar!.id,
        produto_id: i.produto_id,
        qtd_pedida: Number(i.qtd),
        preco_unitario: Number(i.preco) || 0,
      }))
    )
    if (insertError) {
      // Reverte UPDATE e restaura itens originais
      await supabase
        .from('pedidos')
        .update({
          fornecedor_id: pedidoParaEditar!.fornecedor_id,
          previsao_chegada: pedidoParaEditar!.previsao_chegada,
          frete: pedidoParaEditar!.frete ?? 0,
          valor_total: pedidoParaEditar!.valor_total,
        })
        .eq('id', pedidoParaEditar!.id)
      if (itensOriginais.length > 0) {
        const { error: rollbackError } = await supabase.from('pedido_itens').insert(
          itensOriginais.map(i => ({ pedido_id: pedidoParaEditar!.id, ...i }))
        )
        if (rollbackError) {
          throw new Error(`Falha ao salvar e ao restaurar itens: ${insertError.message}`)
        }
      }
      throw new Error(insertError.message)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting || duplicado) return
    setErro(null)
    const preenchidos = itens.filter(i => i.produto_id || i.preco || Number(i.qtd) > 1)
    const validos = preenchidos.filter(i => i.produto_id && Number(i.qtd) >= 1)
    if (!fornecedorId || validos.length === 0) {
      setErro('Selecione o fornecedor e ao menos um item válido')
      return
    }
    if (validos.length !== preenchidos.length) {
      setErro('Há itens incompletos — selecione o produto e informe quantidade ≥ 1, ou remova a linha')
      return
    }
    setSubmitting(true)
    try {
      if (pedidoParaEditar) {
        await handleEditSubmit(validos)
      } else {
        await handleCreateSubmit(validos)
      }
      onSaved()
      onClose()
    } catch (err) {
      setErro(formatarErroSalvarPedido(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={pedidoParaEditar ? `Editar pedido #${pedidoParaEditar.numero}` : 'Novo pedido'}
      size="lg"
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Fornecedor"
            options={fornecedores.map(f => ({ value: f.id, label: f.nome }))}
            value={fornecedorId}
            onChange={(e) => setFornecedorId(e.target.value)}
            required
          />
          <Input
            label="Previsão de chegada"
            type="date"
            value={previsao}
            onChange={(e) => setPrevisao(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-[.08em] text-muted">Itens</span>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                aria-label="Arquivo PDF do pedido"
                className="hidden"
                onChange={handlePdfFileChange}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={importandoPdf}
              >
                <Icon name="download" size={14} />
                {importandoPdf ? 'Lendo PDF...' : 'Importar PDF'}
              </Button>
              <button
                type="button"
                onClick={() => setQuickOpen(!quickOpen)}
                className="text-xs text-gold hover:underline cursor-pointer"
              >
                + Cadastrar produto
              </button>
            </div>
          </div>

          {quickOpen && (
            <div className="flex items-end gap-2 p-3 border border-dashed border-gold-line rounded-lg">
              <Input label="Nome do produto" value={quickNome} onChange={(e) => setQuickNome(e.target.value)} />
              <Input label="Volume (ml)" type="number" value={quickVolume} onChange={(e) => setQuickVolume(e.target.value)} />
              <Select label="Categoria" options={categorias.map(c => ({ value: c.id, label: c.nome }))} value={quickCategoria} onChange={(e) => setQuickCategoria(e.target.value)} />
              <Button type="button" size="sm" onClick={cadastrarProdutoRapido}>Cadastrar</Button>
            </div>
          )}

          {itens.map((item, i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className="grid grid-cols-[1fr_80px_110px_90px_32px] gap-2 items-end">
                <Select
                  label={`Produto ${i + 1}`}
                  options={produtos.map(p => ({ value: p.id, label: p.nome }))}
                  value={item.produto_id}
                  onChange={(e) => setItem(i, {
                    produto_id: e.target.value,
                    matchStatus: e.target.value ? 'matched' : item.matchStatus,
                  })}
                />
                <Input
                  label={`Qtd ${i + 1}`}
                  type="number" min="1"
                  value={item.qtd}
                  onChange={(e) => setItem(i, { qtd: e.target.value })}
                />
                <Input
                  label={`Preço ${i + 1}`}
                  type="number" step="0.01" min="0"
                  value={item.preco}
                  onChange={(e) => setItem(i, { preco: e.target.value })}
                />
                <span className="text-sm font-mono text-text-2 pb-2.5 text-right">
                  = {formatBRL((Number(item.qtd) || 0) * (Number(item.preco) || 0))}
                </span>
                <button
                  type="button"
                  onClick={() => setItens(prev => prev.length > 1 ? prev.filter((_, j) => j !== i) : prev)}
                  className="pb-2.5 text-muted hover:text-down cursor-pointer"
                  title="Remover item"
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
              {item.importado_nome && item.matchStatus !== 'matched' && (
                <p className="text-xs text-warn -mt-1">
                  {item.matchStatus === 'ambiguous'
                    ? `Produto ambíguo: ${item.importado_nome}`
                    : `Produto não encontrado: ${item.importado_nome}`}
                </p>
              )}
            </div>
          ))}

          {duplicado && (
            <p className="text-xs text-down">Produto repetido — una as linhas em um item só</p>
          )}

          <Button
            type="button" variant="secondary" size="sm"
            className="self-start"
            onClick={() => setItens(prev => [...prev, { ...ITEM_VAZIO }])}
          >
            <Icon name="plus" size={14} />
            Adicionar item
          </Button>
        </div>

        <div className="border-t border-line pt-3">
          <Input
            label="Frete (R$)"
            type="number"
            step="0.01"
            min="0"
            value={frete}
            onChange={(e) => setFrete(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between border-t border-line pt-3">
          <span className="text-sm text-muted">Total do pedido</span>
          <span className="text-xl font-mono">{formatBRL(total)}</span>
        </div>

        {erro && (
          <div className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{erro}</div>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={submitting || duplicado}>
            {submitting
              ? (pedidoParaEditar ? 'Salvando...' : 'Criando...')
              : (pedidoParaEditar ? 'Salvar alterações' : 'Criar pedido')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
