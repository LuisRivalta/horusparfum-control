import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/shared/Icon'
import { Modal } from '@/components/shared/Modal'
import { Button, Input, Select } from '@/components/shared/FormControls'

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
  const fileRef = useRef<HTMLInputElement>(null)

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
    setFotoFile(file)
    if (file) {
      setFotoPreview(URL.createObjectURL(file))
    } else {
      setFotoPreview(null)
    }
  }

  function clearFoto() {
    setFotoFile(null)
    setFotoPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

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
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold">Estoque / Catálogo</p>
          <h1 className="text-3xl font-medium tracking-tight mt-1">Produtos</h1>
          <p className="text-muted text-sm mt-1">Catálogo de perfumes</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Icon name="plus" size={16} />
          Novo produto
        </Button>
      </div>

      <div className="border border-line rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface">
              <th className="text-left px-4 py-3 text-text-2 font-medium w-12"></th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Nome</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Volume</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Categoria</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Fornecedor</th>
              <th className="text-right px-4 py-3 text-text-2 font-medium">Estoque</th>
              <th className="text-right px-4 py-3 text-text-2 font-medium">Mínimo</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">Carregando...</td></tr>
            ) : produtos.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">Nenhum produto cadastrado</td></tr>
            ) : (
              produtos.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0 hover:bg-surface-2/50">
                  <td className="px-4 py-2">
                    {p.foto_url ? (
                      <img src={p.foto_url} alt={p.nome} className="w-9 h-9 rounded-lg object-cover" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-surface-2 flex items-center justify-center">
                        <Icon name="box" size={16} className="text-muted" />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium">{p.nome}</td>
                  <td className="px-4 py-3 text-text-2">{p.volume_ml ? `${p.volume_ml}ml` : '—'}</td>
                  <td className="px-4 py-3 text-text-2">{p.categorias?.nome || '—'}</td>
                  <td className="px-4 py-3 text-text-2">{p.fornecedores?.nome || '—'}</td>
                  <td className={`px-4 py-3 text-right font-mono ${p.estoque_atual < p.estoque_minimo ? 'text-down' : 'text-up'}`}>
                    {p.estoque_atual}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-muted">{p.estoque_minimo}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
                <span className="text-xs text-muted">JPG, PNG ou WebP</span>
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
            <Button type="submit">Salvar</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
