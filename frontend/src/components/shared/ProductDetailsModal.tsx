import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Modal } from './Modal'
import { Button, Input, Select } from './FormControls'
import { Icon } from './Icon'

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '')

interface Categoria { id: string; nome: string }
interface Fornecedor { id: string; nome: string }
interface Marca { id: string; nome: string }

export interface Produto {
  id: string
  nome: string
  volume_ml: number | null
  preco_referencia: number | null
  categoria_id: string | null
  fornecedor_id: string | null
  marca_id?: string | null
  estoque_atual: number
  estoque_minimo: number
  foto_url: string | null
  created_at: string
  categorias?: { nome: string } | null
  fornecedores?: { nome: string } | null
  marcas?: { nome: string } | null
}

interface EstoqueMinimoSugestao {
  produto_id: string
  periodo_dias: number
  unidades_vendidas: number
  media_diaria: number
  dias_reposicao: number
  margem_seguranca: number
  estoque_minimo_sugerido: number | null
  tem_dados: boolean
}
interface ProductDetailsModalProps {
  open: boolean
  produto: Produto | null
  categorias: Categoria[]
  fornecedores: Fornecedor[]
  marcas?: Marca[]
  onClose: () => void
  onUpdated: () => void
  onDeleted: () => void
  onRegistrarSaida?: (produtoId: string) => void
  estoqueAction?: 'delete' | 'removeFromStock'
}

export function ProductDetailsModal({
  open,
  produto,
  categorias,
  fornecedores,
  marcas = [],
  onClose,
  onUpdated,
  onDeleted,
  onRegistrarSaida,
  estoqueAction = 'delete',
}: ProductDetailsModalProps) {
  const { user } = useAuth()
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [sugestao, setSugestao] = useState<EstoqueMinimoSugestao | null>(null)
  const [loadingSugestao, setLoadingSugestao] = useState(false)
  const [sugestaoError, setSugestaoError] = useState<string | null>(null)
  const [form, setForm] = useState({
    nome: '',
    volume_ml: '',
    preco_referencia: '',
    categoria_id: '',
    fornecedor_id: '',
    marca_id: '',
    estoque_minimo: '0',
  })

  useEffect(() => {
    if (!open || !produto) {
      setSugestao(null)
      setSugestaoError(null)
      setLoadingSugestao(false)
      return
    }

    let cancelled = false
    const produtoId = produto.id

    async function loadSugestao() {
      setLoadingSugestao(true)
      setSugestao(null)
      setSugestaoError(null)
      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token) throw new Error('Sessao expirada')

        const response = await fetch(`${API_URL}/api/estoque/produtos/${produtoId}/estoque-minimo-sugerido`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) throw new Error('Erro ao carregar sugestao')

        const payload = await response.json() as EstoqueMinimoSugestao
        if (!cancelled) setSugestao(payload)
      } catch {
        if (!cancelled) setSugestaoError('Nao foi possivel carregar sugestao por vendas.')
      } finally {
        if (!cancelled) setLoadingSugestao(false)
      }
    }

    loadSugestao()

    return () => {
      cancelled = true
    }
  }, [open, produto?.id])

  if (!produto) return null

  function startEdit() {
    setForm({
      nome: produto!.nome,
      volume_ml: produto!.volume_ml?.toString() ?? '',
      preco_referencia: produto!.preco_referencia != null ? String(produto!.preco_referencia) : '',
      categoria_id: produto!.categoria_id ?? '',
      fornecedor_id: produto!.fornecedor_id ?? '',
      marca_id: produto!.marca_id ?? '',
      estoque_minimo: produto!.estoque_minimo.toString(),
    })
    setEditing(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const { error } = await supabase.from('produtos').update({
        nome: form.nome,
        volume_ml: form.volume_ml ? Number(form.volume_ml) : null,
        preco_referencia: form.preco_referencia ? Number(form.preco_referencia) : null,
        categoria_id: form.categoria_id || null,
        fornecedor_id: form.fornecedor_id || null,
        marca_id: form.marca_id || null,
        estoque_minimo: Number(form.estoque_minimo),
      }).eq('id', produto!.id)
      if (!error) {
        onUpdated()
        setEditing(false)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setDeleteError(null)
    try {
      if (estoqueAction === 'removeFromStock') {
        const { error } = await supabase.rpc('registrar_saida', {
          p_produto_id: produto!.id,
          p_qtd: produto!.estoque_atual,
          p_motivo: 'Removido do estoque',
          p_responsavel: user?.email || null,
        })

        if (error) {
          setDeleteError('Nao foi possivel remover este produto do estoque. Tente novamente.')
          return
        }

        onUpdated()
        onClose()
        setConfirmingDelete(false)
        return
      }

      const { error } = await supabase.from('produtos').delete().eq('id', produto!.id)
      if (error) {
        setDeleteError(
          'Nao foi possivel excluir este produto. Ele pode ter historico de estoque, pedidos, vendas ou decants vinculados.'
        )
        return
      }

      onDeleted()
      onClose()
      setConfirmingDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  const estoqueBaixo = produto.estoque_atual < produto.estoque_minimo
  const semEstoque = produto.estoque_atual === 0
  const removingFromStock = estoqueAction === 'removeFromStock'
  const destructiveLabel = removingFromStock ? 'Remover do estoque' : 'Excluir'
  const confirmTitle = removingFromStock ? 'Remover do estoque?' : 'Excluir produto?'
  const confirmText = removingFromStock
    ? `O cadastro de ${produto.nome} sera mantido. Vamos registrar uma saida de ${produto.estoque_atual} unidade${produto.estoque_atual !== 1 ? 's' : ''} e zerar o estoque atual.`
    : null
  const confirmButtonLabel = removingFromStock ? 'Remover' : 'Excluir'
  const submittingLabel = removingFromStock ? 'Removendo...' : 'Excluindo...'

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar produto' : 'Detalhes do produto'} size="lg">
      {editing ? (
        <form onSubmit={handleSave} className="flex flex-col gap-3">
          <Input label="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Volume (ml)" type="number" value={form.volume_ml} onChange={(e) => setForm({ ...form, volume_ml: e.target.value })} />
            <Select label="Categoria" options={[{ value: '', label: '—' }, ...categorias.map(c => ({ value: c.id, label: c.nome }))]} value={form.categoria_id} onChange={(e) => setForm({ ...form, categoria_id: e.target.value })} />
          </div>
          <Input
            label="Preço de referência (R$)"
            type="number" step="0.01" min="0"
            value={form.preco_referencia}
            onChange={(e) => setForm({ ...form, preco_referencia: e.target.value })}
          />
          <Select label="Fornecedor" options={[{ value: '', label: '—' }, ...fornecedores.map(f => ({ value: f.id, label: f.nome }))]} value={form.fornecedor_id} onChange={(e) => setForm({ ...form, fornecedor_id: e.target.value })} />
          <Select label="Marca" options={[{ value: '', label: '—' }, ...marcas.map(m => ({ value: m.id, label: m.nome }))]} value={form.marca_id} onChange={(e) => setForm({ ...form, marca_id: e.target.value })} />
          <div className="flex flex-col gap-2">
            <Input label="Estoque minimo" type="number" value={form.estoque_minimo} onChange={(e) => setForm({ ...form, estoque_minimo: e.target.value })} />
            <SugestaoEstoqueMinimo
              sugestao={sugestao}
              loading={loadingSugestao}
              error={sugestaoError}
              onUse={(valor) => setForm({ ...form, estoque_minimo: String(valor) })}
            />
          </div>
          <div className="flex justify-end gap-3 mt-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex gap-6">
            <div className="w-64 h-64 rounded-xl bg-surface-2 overflow-hidden flex items-center justify-center flex-shrink-0">
              {produto.foto_url ? (
                <img src={produto.foto_url} alt={produto.nome} className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted">
                  <Icon name="box" size={48} />
                  <span className="text-xs">Sem foto</span>
                </div>
              )}
            </div>
            <div className="flex-1 flex flex-col gap-3 min-w-0">
              <div>
                <h2 className="text-2xl font-medium truncate">{produto.nome}</h2>
                <p className="text-sm text-muted font-mono mt-1">{produto.volume_ml ? `${produto.volume_ml}mL` : '—'}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted uppercase tracking-wider mb-0.5">Categoria</div>
                  <div className="text-text-2">{produto.categorias?.nome || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted uppercase tracking-wider mb-0.5">Fornecedor</div>
                  <div className="text-text-2">{produto.fornecedores?.nome || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted uppercase tracking-wider mb-0.5">Marca</div>
                  <div className="text-text-2">{produto.marcas?.nome || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted uppercase tracking-wider mb-0.5">Estoque atual</div>
                  <div className={`font-mono text-2xl ${semEstoque ? 'text-down' : estoqueBaixo ? 'text-warn' : 'text-up'}`}>
                    {produto.estoque_atual}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted uppercase tracking-wider mb-0.5">Estoque mínimo</div>
                  <div className="font-mono text-2xl text-text-2">{produto.estoque_minimo}</div>
                </div>
                <div className="col-span-2">
                  <SugestaoEstoqueMinimo
                    sugestao={sugestao}
                    loading={loadingSugestao}
                    error={sugestaoError}
                  />
                </div>
                {produto.preco_referencia != null && (
                  <div>
                    <div className="text-xs text-muted uppercase tracking-wider mb-0.5">Preço de referência</div>
                    <div className="font-mono text-text-2">
                      {produto.preco_referencia.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </div>
                  </div>
                )}
              </div>
              {estoqueBaixo && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warn/10 border border-warn/30 text-warn text-xs">
                  <Icon name="warn" size={14} />
                  {semEstoque ? 'Sem estoque' : 'Estoque abaixo do mínimo'}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between gap-3 mt-2 pt-4 border-t border-line">
            <Button
              variant="danger"
              onClick={() => {
                setDeleteError(null)
                setConfirmingDelete(true)
              }}
            >
              <Icon name="trash" size={14} />
              {destructiveLabel}
            </Button>
            <div className="flex gap-2">
              {onRegistrarSaida && produto && (
                <Button variant="secondary" size="sm" onClick={() => onRegistrarSaida(produto.id)}>
                  <Icon name="down" size={14} />
                  Registrar saída
                </Button>
              )}
              <Button onClick={startEdit}>
                <Icon name="edit" size={14} />
                Editar
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => {
            setDeleteError(null)
            setConfirmingDelete(false)
          }}
        >
          <div className="bg-surface border border-line rounded-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-medium mb-2">{confirmTitle}</h3>
            <p className="text-sm text-muted mb-5">
              {confirmText ?? (
                <>
                  Esta ação não pode ser desfeita. O produto <strong className="text-text-2">{produto.nome}</strong> será removido permanentemente.
                </>
              )}
            </p>
            {deleteError && (
              <div className="mb-4 rounded-lg border border-down/30 bg-down/10 px-3 py-2 text-sm text-down">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setDeleteError(null)
                  setConfirmingDelete(false)
                }}
              >
                Cancelar
              </Button>
              <Button variant="danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? submittingLabel : confirmButtonLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
function SugestaoEstoqueMinimo({
  sugestao,
  loading,
  error,
  onUse,
}: {
  sugestao: EstoqueMinimoSugestao | null
  loading: boolean
  error: string | null
  onUse?: (valor: number) => void
}) {
  if (loading) {
    return (
      <div data-testid="sugestao-estoque-minimo" className="rounded-lg border border-line bg-raise/40 px-3 py-2 text-xs text-muted">
        Calculando sugestao por vendas...
      </div>
    )
  }

  if (error) {
    return (
      <div data-testid="sugestao-estoque-minimo" className="rounded-lg border border-down/30 bg-down/10 px-3 py-2 text-xs text-down">
        {error}
      </div>
    )
  }

  if (!sugestao) return null

  if (!sugestao.tem_dados || sugestao.estoque_minimo_sugerido == null) {
    return (
      <div data-testid="sugestao-estoque-minimo" className="rounded-lg border border-line bg-raise/40 px-3 py-2 text-xs text-muted">
        Ainda sem vendas suficientes para sugerir.
      </div>
    )
  }

  return (
    <div data-testid="sugestao-estoque-minimo" className="flex items-center justify-between gap-3 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2">
      <div>
        <div className="text-xs uppercase tracking-wider text-gold">Sugestao por vendas</div>
        <div className="text-xs text-muted">
          {sugestao.unidades_vendidas} un. em {sugestao.periodo_dias} dias, reposicao de {sugestao.dias_reposicao} dias
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-lg text-text">{sugestao.estoque_minimo_sugerido}</span>
        {onUse && (
          <Button type="button" size="sm" variant="secondary" onClick={() => onUse(sugestao.estoque_minimo_sugerido!)}>
            Usar sugestao
          </Button>
        )}
      </div>
    </div>
  )
}
