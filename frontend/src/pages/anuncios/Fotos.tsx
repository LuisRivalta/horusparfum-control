import { useEffect, useState } from 'react'
import { Select } from '@/components/shared/FormControls'
import { supabase } from '@/lib/supabase'
import { FotosPerfume } from './FotosPerfume'

interface Perfume { id: string; nome: string }

export function FotosAnuncios() {
  const [perfumes, setPerfumes] = useState<Perfume[]>([])
  const [produtoId, setProdutoId] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    Promise.all([
      supabase.from('produtos').select('id, nome, marca_id').order('nome'),
      supabase.from('marcas').select('id, nome'),
    ]).then(([p, m]) => {
      if (!vivo) return
      if (p.error || m.error) { setErro('Não foi possível carregar os perfumes.'); return }
      const marca = new Map((m.data ?? []).map((x: { id: string; nome: string }) => [x.id, x.nome]))
      setPerfumes((p.data ?? []).map((x: { id: string; nome: string; marca_id: string | null }) => ({
        id: x.id, nome: `${marca.get(x.marca_id ?? '') ?? ''} ${x.nome}`.trim(),
      })))
    })
    return () => { vivo = false }
  }, [])

  const perfume = perfumes.find((p) => p.id === produtoId)

  return (
    <div className="page-enter max-w-5xl mx-auto space-y-5">
      <header>
        <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold">◆ Anúncios / Fotos</p>
        <h1>Fotos</h1>
        <p className="text-sm text-muted">As fotos dos anúncios de cada perfume. Os criadores do ML e da Shopify usam as mesmas.</p>
      </header>
      {erro && <div role="alert" className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{erro}</div>}
      <Select aria-label="Perfume" value={produtoId} placeholder="Escolha o perfume" onChange={(e) => setProdutoId(e.target.value)}
        options={perfumes.map((p) => ({ value: p.id, label: p.nome }))} />
      {perfume && <FotosPerfume key={perfume.id} produtoId={perfume.id} nome={perfume.nome} />}
    </div>
  )
}
