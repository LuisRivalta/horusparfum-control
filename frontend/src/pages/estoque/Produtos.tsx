import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/shared/Icon'
import { Modal } from '@/components/shared/Modal'
import { Button, Input, Select } from '@/components/shared/FormControls'
import { ImageCropper } from '@/components/shared/ImageCropper'
import { ProductDetailsModal } from '@/components/shared/ProductDetailsModal'
import { SaidaRapidaModal } from '@/components/shared/SaidaRapidaModal'
import './Produtos.css'

interface Produto {
  id: string
  nome: string
  volume_ml: number | null
  categoria_id: string | null
  fornecedor_id: string | null
  estoque_atual: number
  estoque_minimo: number
  foto_url: string | null
  created_at: string
  categorias?: { nome: string } | null
  fornecedores?: { nome: string } | null
}

interface Categoria {
  id: string
  nome: string
}

interface Fornecedor {
  id: string
  nome: string
}

export function EstProdutos() {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [fotoFile, setFotoFile] = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [cropperOpen, setCropperOpen] = useState(false)
  const [cropperImage, setCropperImage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [search, setSearch] = useState('')
  const [filterCategoria, setFilterCategoria] = useState('')
  const [filterFornecedor, setFilterFornecedor] = useState('')
  const [filterSituacao, setFilterSituacao] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [selectedProduto, setSelectedProduto] = useState<Produto | null>(null)
  const [saidaOpen, setSaidaOpen] = useState(false)
  const [saidaProdutoId, setSaidaProdutoId] = useState<string | undefined>(undefined)

  const produtosFiltrados = produtos.filter((p) => {
    if (search && !p.nome.toLowerCase().includes(search.toLowerCase())) return false
    if (filterCategoria && p.categoria_id !== filterCategoria) return false
    if (filterFornecedor && p.fornecedor_id !== filterFornecedor) return false
    if (filterSituacao) {
      const e = p.estoque_atual
      if (filterSituacao === 'disponivel' && e <= p.estoque_minimo) return false
      if (filterSituacao === 'baixo' && (e === 0 || e > p.estoque_minimo)) return false
      if (filterSituacao === 'critico' && (e === 0 || e > Math.ceil(p.estoque_minimo * 0.5))) return false
      if (filterSituacao === 'sem_estoque' && e > 0) return false
    }
    return true
  })

  const [form, setForm] = useState({
    nome: '',
    volume_ml: '',
    categoria_id: '',
    fornecedor_id: '',
    estoque_atual: '0',
    estoque_minimo: '0',
  })

  async function fetchData() {
    setLoading(true)
    const [{ data: prods }, { data: cats }, { data: forns }] = await Promise.all([
      supabase.from('produtos').select('*, categorias(nome), fornecedores(nome)').order('created_at', { ascending: false }),
      supabase.from('categorias').select('id, nome'),
      supabase.from('fornecedores').select('id, nome'),
    ])
    setProdutos(prods || [])
    setCategorias(cats || [])
    setFornecedores(forns || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null
    if (file) {
      const reader = new FileReader()
      reader.onload = () => {
        setCropperImage(reader.result as string)
        setCropperOpen(true)
      }
      reader.readAsDataURL(file)
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleCropConfirm(croppedFile: File) {
    setFotoFile(croppedFile)
    setFotoPreview(URL.createObjectURL(croppedFile))
    setCropperOpen(false)
    setCropperImage(null)
  }

  function clearFoto() {
    setFotoFile(null)
    setFotoPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  // Ctrl+V para colar imagem da clipboard
  useEffect(() => {
    if (!modalOpen) return
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) {
            const reader = new FileReader()
            reader.onload = () => {
              setCropperImage(reader.result as string)
              setCropperOpen(true)
            }
            reader.readAsDataURL(file)
          }
          return
        }
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [modalOpen])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)

    try {
      let foto_url: string | null = null

      if (fotoFile) {
        const ext = fotoFile.name.split('.').pop()
        const path = `${crypto.randomUUID()}.${ext}`
        const { error } = await supabase.storage.from('produtos').upload(path, fotoFile)
        if (!error) {
          const { data } = supabase.storage.from('produtos').getPublicUrl(path)
          foto_url = data.publicUrl
        }
      }

      await supabase.from('produtos').insert({
        nome: form.nome,
        volume_ml: form.volume_ml ? Number(form.volume_ml) : null,
        categoria_id: form.categoria_id || null,
        fornecedor_id: form.fornecedor_id || null,
        estoque_atual: Number(form.estoque_atual),
        estoque_minimo: Number(form.estoque_minimo),
        foto_url,
      })

      setForm({ nome: '', volume_ml: '', categoria_id: '', fornecedor_id: '', estoque_atual: '0', estoque_minimo: '0' })
      clearFoto()
      setModalOpen(false)
      fetchData()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold">Estoque / Catálogo</p>
          <h1 className="text-3xl font-medium tracking-tight mt-1">Produtos</h1>
          <p className="text-muted text-sm mt-1">
            {produtosFiltrados.length === produtos.length
              ? `${produtos.length} produtos no catálogo`
              : `${produtosFiltrados.length} de ${produtos.length} produtos`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(search || filterCategoria || filterFornecedor || filterSituacao) && (
            <button
              type="button"
              onClick={() => { setSearch(''); setFilterCategoria(''); setFilterFornecedor(''); setFilterSituacao('') }}
              className="text-xs text-muted hover:text-text transition-colors cursor-pointer"
            >
              Limpar filtros
            </button>
          )}
          <Button variant="secondary" onClick={() => { setSaidaProdutoId(undefined); setSaidaOpen(true) }}>
            <Icon name="down" size={16} />
            Registrar saída
          </Button>
          <Button variant="secondary">
            <Icon name="download" size={16} />
            Importar
          </Button>
          <Button onClick={() => setModalOpen(true)}>
            <Icon name="plus" size={16} />
            Novo produto
          </Button>
        </div>
      </div>

      {/* Barra de busca e filtros */}
      <div className="flex items-center gap-2.5">
        <div className="flex-1 max-w-md relative">
          <Icon name="search" size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar perfume ou SKU..."
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
        <Select
          label=""
          options={[
            { value: '', label: 'Situação' },
            { value: 'disponivel', label: 'Disponível' },
            { value: 'baixo', label: 'Estoque baixo' },
            { value: 'critico', label: 'Crítico' },
            { value: 'sem_estoque', label: 'Sem estoque' },
          ]}
          value={filterSituacao}
          onChange={(e) => setFilterSituacao(e.target.value)}
        />
      </div>

      {/* Grid de cards */}
      {loading ? (
        <div className="py-12 text-center text-muted">Carregando...</div>
      ) : produtosFiltrados.length === 0 ? (
        <div className="py-12 text-center text-muted border border-dashed border-line rounded-xl">
          Nenhum produto encontrado
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-3">
          {produtosFiltrados.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedProduto(p)}
              className="holographic-card group text-left border border-line rounded-xl p-2 hover:border-gold-line transition-colors cursor-pointer"
            >
              <div className="aspect-square rounded-lg bg-surface-2 overflow-hidden flex items-center justify-center mb-2">
                {p.foto_url ? (
                  <img src={p.foto_url} alt={p.nome} className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-muted">
                    <Icon name="box" size={20} />
                    <span className="text-[10px]">Foto</span>
                  </div>
                )}
              </div>
              <div className="px-1">
                <div className="text-sm font-medium truncate" title={p.nome}>{p.nome}</div>
                <div className="text-xs text-muted font-mono mt-0.5">{p.volume_ml ? `${p.volume_ml}mL` : '—'}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); clearFoto() }} title="Novo produto">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Upload de foto */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-text-2">Foto do produto</label>
            <div className="flex items-center gap-3">
              {fotoPreview ? (
                <div className="relative">
                  <img src={fotoPreview} alt="Preview" className="w-16 h-16 rounded-lg object-cover border border-line" />
                  <button
                    type="button"
                    onClick={clearFoto}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-down text-white rounded-full flex items-center justify-center text-xs cursor-pointer"
                  >
                    ×
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCropperImage(fotoPreview); setCropperOpen(true) }}
                    className="absolute -bottom-1.5 -right-1.5 w-5 h-5 bg-gold text-[#1A1407] rounded-full flex items-center justify-center text-xs cursor-pointer"
                    title="Ajustar"
                  >
                    ✎
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-16 h-16 rounded-lg border border-dashed border-line-2 flex flex-col items-center justify-center gap-0.5 text-muted hover:text-text hover:border-gold/50 transition-colors cursor-pointer"
                >
                  <Icon name="plus" size={18} />
                  <span className="text-[10px]">Foto</span>
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              {!fotoPreview && (
                <span className="text-xs text-muted">JPG, PNG ou WebP — ou cole com Ctrl+V</span>
              )}
            </div>
          </div>

          <Input label="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Volume (ml)" type="number" value={form.volume_ml} onChange={(e) => setForm({ ...form, volume_ml: e.target.value })} />
            <Select label="Categoria" options={categorias.map(c => ({ value: c.id, label: c.nome }))} value={form.categoria_id} onChange={(e) => setForm({ ...form, categoria_id: e.target.value })} />
          </div>
          <Select label="Fornecedor" options={fornecedores.map(f => ({ value: f.id, label: f.nome }))} value={form.fornecedor_id} onChange={(e) => setForm({ ...form, fornecedor_id: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Estoque atual" type="number" value={form.estoque_atual} onChange={(e) => setForm({ ...form, estoque_atual: e.target.value })} />
            <Input label="Estoque mínimo" type="number" value={form.estoque_minimo} onChange={(e) => setForm({ ...form, estoque_minimo: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 mt-2">
            <Button type="button" variant="secondary" onClick={() => { setModalOpen(false); clearFoto() }}>Cancelar</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </Modal>

      <ImageCropper
        open={cropperOpen}
        imageSrc={cropperImage}
        onCancel={() => { setCropperOpen(false); setCropperImage(null) }}
        onConfirm={handleCropConfirm}
      />

      <ProductDetailsModal
        open={!!selectedProduto}
        produto={selectedProduto}
        categorias={categorias}
        fornecedores={fornecedores}
        onClose={() => setSelectedProduto(null)}
        onUpdated={fetchData}
        onDeleted={fetchData}
        onRegistrarSaida={(id) => { setSelectedProduto(null); setSaidaProdutoId(id); setSaidaOpen(true) }}
      />

      <SaidaRapidaModal open={saidaOpen} produtoId={saidaProdutoId} onClose={() => { setSaidaOpen(false); setSaidaProdutoId(undefined) }} onDone={fetchData} />
    </div>
  )
}
