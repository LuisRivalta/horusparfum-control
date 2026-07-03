import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { Icon } from '@/components/shared/Icon'
import { Button, Select } from '@/components/shared/FormControls'
import { ProductDetailsModal } from '@/components/shared/ProductDetailsModal'
import { SaidaRapidaModal } from '@/components/shared/SaidaRapidaModal'
import { EntradaRapidaModal } from '@/components/shared/EntradaRapidaModal'
import { situacaoEstoque, ordenarProdutos, type OrdemEstoque, type SituacaoEstoque } from '@/lib/estoque'

interface Produto {
  id: string
  nome: string
  volume_ml: number | null
  categoria_id: string | null
  fornecedor_id: string | null
  marca_id: string | null
  estoque_atual: number
  estoque_minimo: number
  foto_url: string | null
  preco_referencia: number | null
  created_at: string
  categorias?: { nome: string } | null
  fornecedores?: { nome: string } | null
  marcas?: { nome: string } | null
}

interface Categoria { id: string; nome: string }
interface Fornecedor { id: string; nome: string }
interface Marca { id: string; nome: string }

const BADGE_CLASSES: Record<SituacaoEstoque, string> = {
  ok: 'bg-gold text-[#1A1407]',
  baixo: 'bg-orange-400 text-white',
  critico: 'bg-down text-white',
}

export function EstEstoque() {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [marcas, setMarcas] = useState<Marca[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterCategoria, setFilterCategoria] = useState('')
  const [filterFornecedor, setFilterFornecedor] = useState('')
  const [filterMarca, setFilterMarca] = useState('')
  const [ordem, setOrdem] = useState<OrdemEstoque>('qty_desc')
  const [selectedProduto, setSelectedProduto] = useState<Produto | null>(null)
  const [saidaOpen, setSaidaOpen] = useState(false)
  const [saidaProdutoId, setSaidaProdutoId] = useState<string | undefined>(undefined)
  const [entradaOpen, setEntradaOpen] = useState(false)
  const [entradaProdutoId, setEntradaProdutoId] = useState<string | undefined>(undefined)

  async function carregar() {
    setLoading(true)
    setErro(null)
    const [{ data: prods, error: e1 }, { data: cats }, { data: forns }, { data: marcasData }] = await Promise.all([
      supabase.from('produtos').select('*, categorias(nome), fornecedores(nome), marcas(nome)').gt('estoque_atual', 0),
      supabase.from('categorias').select('id, nome'),
      supabase.from('fornecedores').select('id, nome'),
      supabase.from('marcas').select('id, nome'),
    ])
    if (e1) { setErro(e1.message); setLoading(false); return }
    setProdutos((prods as Produto[]) ?? [])
    setCategorias(cats ?? [])
    setFornecedores(forns ?? [])
    setMarcas(marcasData ?? [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  const filtrados = ordenarProdutos(
    produtos.filter((p) => {
      if (search && !p.nome.toLowerCase().includes(search.toLowerCase())) return false
      if (filterCategoria && p.categoria_id !== filterCategoria) return false
      if (filterFornecedor && p.fornecedor_id !== filterFornecedor) return false
      if (filterMarca && p.marca_id !== filterMarca) return false
      return true
    }),
    ordem
  )

  const temFiltros = !!(search || filterCategoria || filterFornecedor || filterMarca)

  return (
    <>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold">
              Estoque / Visão
            </p>
            <h1 className="text-3xl font-medium tracking-tight mt-1">Estoque</h1>
            <p className="text-muted text-sm mt-1">
              {filtrados.length === produtos.length
                ? `${produtos.length} produto${produtos.length !== 1 ? 's' : ''} em estoque`
                : `${filtrados.length} de ${produtos.length} produtos`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {temFiltros && (
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  setFilterCategoria('')
                  setFilterFornecedor('')
                  setFilterMarca('')
                }}
                className="text-xs text-muted hover:text-text transition-colors cursor-pointer"
              >
                Limpar filtros
              </button>
            )}
            <Button
              variant="secondary"
              onClick={() => { setSaidaProdutoId(undefined); setSaidaOpen(true) }}
            >
              <Icon name="down" size={16} />
              Registrar saída
            </Button>
            <Button
              onClick={() => { setEntradaProdutoId(undefined); setEntradaOpen(true) }}
            >
              <Icon name="up" size={16} />
              Registrar entrada
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="flex-1 max-w-md relative">
            <Icon
              name="search"
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
            />
            <input
              type="text"
              placeholder="Buscar perfume..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-line bg-surface text-text text-sm placeholder:text-faint focus:outline-none focus:border-gold/60 transition-colors"
            />
          </div>
          <Select
            label=""
            options={[{ value: '', label: 'Categoria' }, ...categorias.map(c => ({ value: c.id, label: c.nome }))]}
            value={filterCategoria}
            onChange={(e) => setFilterCategoria(e.target.value)}
          />
          <Select
            label=""
            options={[{ value: '', label: 'Fornecedor' }, ...fornecedores.map(f => ({ value: f.id, label: f.nome }))]}
            value={filterFornecedor}
            onChange={(e) => setFilterFornecedor(e.target.value)}
          />
          <div className="relative">
            <select
              className="w-full appearance-none px-3.5 py-2.5 pr-9 rounded-lg border border-line bg-surface-2 text-text text-sm cursor-pointer transition-all duration-200 focus:outline-none focus:border-gold/60 focus:shadow-[0_0_0_3px_rgba(201,168,76,0.12)] hover:border-line-2"
              value={filterMarca}
              onChange={(e) => setFilterMarca(e.target.value)}
            >
              <option value="">Marca</option>
              {marcas.map((m) => (
                <option key={m.id} value={m.id}>{m.nome}</option>
              ))}
            </select>
            <svg
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
              width="12" height="12" viewBox="0 0 12 12" fill="none"
            >
              <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <Select
            label=""
            options={[
              { value: 'qty_desc', label: 'Maior quantidade' },
              { value: 'qty_asc', label: 'Menor quantidade' },
              { value: 'az', label: 'A → Z' },
              { value: 'za', label: 'Z → A' },
            ]}
            value={ordem}
            onChange={(e) => setOrdem(e.target.value as OrdemEstoque)}
          />
        </div>

        {erro && (
          <div className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">
            Erro ao carregar: {erro}
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-muted">Carregando...</div>
        ) : filtrados.length === 0 ? (
          <div className="py-12 text-center text-muted border border-dashed border-line rounded-xl">
            <Icon name="box" size={32} className="mx-auto mb-3 opacity-30" />
            {temFiltros ? (
              <p className="text-sm">Nenhum produto encontrado com esses filtros</p>
            ) : (
              <>
                <p className="text-sm">Nenhum produto em estoque</p>
                <p className="text-xs mt-1 opacity-60">
                  Registre uma entrada via Pedidos para começar
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-3">
            {filtrados.map((p) => {
              const sit = situacaoEstoque(p.estoque_atual, p.estoque_minimo)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProduto(p)}
                  className="holographic-card group text-left border border-line rounded-xl p-2 hover:border-gold-line transition-colors cursor-pointer"
                >
                  <div className="relative aspect-square rounded-lg bg-surface-2 overflow-hidden flex items-center justify-center mb-2">
                    {p.foto_url ? (
                      <img src={p.foto_url} alt={p.nome} className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-muted">
                        <Icon name="box" size={20} />
                        <span className="text-[10px]">Foto</span>
                      </div>
                    )}
                    <span
                      className={cn(
                        'absolute top-1 right-1 text-[0.6rem] font-bold tabular-nums px-1.5 py-0.5 rounded-full leading-none',
                        BADGE_CLASSES[sit]
                      )}
                    >
                      {p.estoque_atual}
                    </span>
                  </div>
                  <div className="px-1">
                    <div className="text-sm font-medium truncate" title={p.nome}>
                      {p.nome}
                    </div>
                    <div className="text-xs text-muted font-mono mt-0.5">
                      {p.volume_ml ? `${p.volume_ml}mL` : '—'}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <ProductDetailsModal
        open={!!selectedProduto}
        produto={selectedProduto}
        categorias={categorias}
        fornecedores={fornecedores}
        marcas={marcas}
        onClose={() => setSelectedProduto(null)}
        onUpdated={carregar}
        onDeleted={carregar}
        estoqueAction="removeFromStock"
        onRegistrarSaida={(id) => {
          setSelectedProduto(null)
          setSaidaProdutoId(id)
          setSaidaOpen(true)
        }}
      />

      <SaidaRapidaModal
        open={saidaOpen}
        produtoId={saidaProdutoId}
        onClose={() => { setSaidaOpen(false); setSaidaProdutoId(undefined) }}
        onDone={carregar}
      />

      <EntradaRapidaModal
        open={entradaOpen}
        produtoId={entradaProdutoId}
        onClose={() => { setEntradaOpen(false); setEntradaProdutoId(undefined) }}
        onDone={carregar}
      />
    </>
  )
}
