import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Modal } from '@/components/shared/Modal'
import { Button, Input, Select } from '@/components/shared/FormControls'
import { Icon } from '@/components/shared/Icon'
import { formatBRL } from '@/lib/utils'
import { calcularTotalPedido } from '@/lib/pedidos'

interface Opcao { id: string; nome: string }

interface ItemForm {
  produto_id: string
  qtd: string
  preco: string
}

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

const ITEM_VAZIO: ItemForm = { produto_id: '', qtd: '1', preco: '' }

export function NovoPedidoModal({ open, onClose, onCreated }: Props) {
  const { user } = useAuth()
  const [fornecedores, setFornecedores] = useState<Opcao[]>([])
  const [produtos, setProdutos] = useState<Opcao[]>([])
  const [fornecedorId, setFornecedorId] = useState('')
  const [previsao, setPrevisao] = useState('')
  const [itens, setItens] = useState<ItemForm[]>([{ ...ITEM_VAZIO }])
  const [submitting, setSubmitting] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // cadastro rápido de produto
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickNome, setQuickNome] = useState('')
  const [quickVolume, setQuickVolume] = useState('')

  useEffect(() => {
    if (!open) return
    Promise.all([
      supabase.from('fornecedores').select('id, nome').order('nome'),
      supabase.from('produtos').select('id, nome').order('nome'),
    ]).then(([f, p]) => {
      setFornecedores(f.data || [])
      setProdutos(p.data || [])
    })
  }, [open])

  const duplicado = itens.some(
    (item, i) => item.produto_id && itens.findIndex(o => o.produto_id === item.produto_id) !== i
  )

  const total = calcularTotalPedido(
    itens.map(i => ({ qtd: Number(i.qtd) || 0, preco: Number(i.preco) || 0 }))
  )

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
      setQuickOpen(false)
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
      const { data: pedido, error } = await supabase
        .from('pedidos')
        .insert({
          fornecedor_id: fornecedorId,
          previsao_chegada: previsao || null,
          valor_total: calcularTotalPedido(validos.map(i => ({ qtd: Number(i.qtd), preco: Number(i.preco) || 0 }))),
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
        // evita pedido órfão sem itens
        await supabase.from('pedidos').delete().eq('id', pedido.id)
        throw new Error(itensError.message)
      }

      setFornecedorId(''); setPrevisao(''); setItens([{ ...ITEM_VAZIO }])
      onCreated()
      onClose()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar pedido')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo pedido" size="lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
            <button
              type="button"
              onClick={() => setQuickOpen(!quickOpen)}
              className="text-xs text-gold hover:underline cursor-pointer"
            >
              + Cadastrar produto
            </button>
          </div>

          {quickOpen && (
            <div className="flex items-end gap-2 p-3 border border-dashed border-gold-line rounded-lg">
              <Input label="Nome do produto" value={quickNome} onChange={(e) => setQuickNome(e.target.value)} />
              <Input label="Volume (ml)" type="number" value={quickVolume} onChange={(e) => setQuickVolume(e.target.value)} />
              <Button type="button" size="sm" onClick={cadastrarProdutoRapido}>Cadastrar</Button>
            </div>
          )}

          {itens.map((item, i) => (
            <div key={i} className="grid grid-cols-[1fr_80px_110px_90px_32px] gap-2 items-end">
              <Select
                label={`Produto ${i + 1}`}
                options={produtos.map(p => ({ value: p.id, label: p.nome }))}
                value={item.produto_id}
                onChange={(e) => setItem(i, { produto_id: e.target.value })}
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
            {submitting ? 'Salvando...' : 'Criar pedido'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
