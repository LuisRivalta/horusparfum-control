import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/shared/Icon'
import { Button, Input } from '@/components/shared/FormControls'

interface Canal { id: string; nome: string; taxa_padrao: number; ativo: boolean }
interface Embalagem { id: string; tamanho_ml: number; custo: number; ativo: boolean }

export function VendasConfig() {
  const navigate = useNavigate()
  const [canais, setCanais] = useState<Canal[]>([])
  const [embalagens, setEmbalagens] = useState<Embalagem[]>([])
  const [novoCanal, setNovoCanal] = useState({ nome: '', taxa: '' })
  const [novaEmb, setNovaEmb] = useState({ tamanho: '', custo: '' })
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const [c, e] = await Promise.all([
      supabase.from('canais').select('*').order('nome'),
      supabase.from('embalagens_decant').select('*').order('tamanho_ml'),
    ])
    setCanais((c.data as Canal[]) || [])
    setEmbalagens((e.data as Embalagem[]) || [])
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function addCanal() {
    if (!novoCanal.nome.trim()) return
    const { error } = await supabase.from('canais').insert({
      nome: novoCanal.nome.trim(),
      taxa_padrao: Number(novoCanal.taxa) || 0,
    })
    if (error) { setErro(error.message); return }
    setNovoCanal({ nome: '', taxa: '' }); setErro(null); carregar()
  }

  async function updateCanalTaxa(id: string, taxa: number) {
    await supabase.from('canais').update({ taxa_padrao: taxa }).eq('id', id)
    carregar()
  }

  async function toggleCanal(id: string, ativo: boolean) {
    await supabase.from('canais').update({ ativo }).eq('id', id)
    carregar()
  }

  async function addEmbalagem() {
    if (!novaEmb.tamanho) return
    const { error } = await supabase.from('embalagens_decant').insert({
      tamanho_ml: Number(novaEmb.tamanho),
      custo: Number(novaEmb.custo) || 0,
    })
    if (error) { setErro(error.message); return }
    setNovaEmb({ tamanho: '', custo: '' }); setErro(null); carregar()
  }

  async function updateEmbCusto(id: string, custo: number) {
    await supabase.from('embalagens_decant').update({ custo }).eq('id', id)
    carregar()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/estoque/vendas')} className="text-muted hover:text-gold cursor-pointer">
          <Icon name="chevron" size={18} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <div>
          <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold">Estoque / Vendas</p>
          <h1 className="text-2xl font-medium tracking-tight">Canais e embalagens</h1>
        </div>
      </div>

      {erro && (
        <div className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{erro}</div>
      )}

      {/* Canais */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium uppercase tracking-[.08em] text-muted">Canais de venda</h2>
        <div className="flex flex-col gap-2">
          {canais.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-3 border border-line rounded-lg">
              <span className={`flex-1 font-medium ${!c.ativo ? 'text-muted line-through' : ''}`}>{c.nome}</span>
              <div className="flex items-center gap-1">
                <div className="w-24">
                  <Input
                    label="" type="number" step="0.01" min="0"
                    value={String(c.taxa_padrao)}
                    onChange={(e) => updateCanalTaxa(c.id, Number(e.target.value) || 0)}
                  />
                </div>
                <span className="text-muted text-sm">%</span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => toggleCanal(c.id, !c.ativo)}>
                {c.ativo ? 'Desativar' : 'Ativar'}
              </Button>
            </div>
          ))}
        </div>
        <div className="flex items-end gap-2 p-3 border border-dashed border-gold-line rounded-lg">
          <Input label="Novo canal" value={novoCanal.nome} onChange={(e) => setNovoCanal({ ...novoCanal, nome: e.target.value })} />
          <div className="w-28">
            <Input label="Taxa %" type="number" step="0.01" min="0" value={novoCanal.taxa} onChange={(e) => setNovoCanal({ ...novoCanal, taxa: e.target.value })} />
          </div>
          <Button type="button" size="sm" onClick={addCanal}>Adicionar</Button>
        </div>
      </section>

      {/* Embalagens */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium uppercase tracking-[.08em] text-muted">Embalagens de decant (custo do insumo)</h2>
        <div className="flex flex-col gap-2">
          {embalagens.map((e) => (
            <div key={e.id} className="flex items-center gap-3 p-3 border border-line rounded-lg">
              <span className="flex-1 font-medium">{e.tamanho_ml} ml</span>
              <div className="flex items-center gap-1">
                <span className="text-muted text-sm">R$</span>
                <div className="w-24">
                  <Input
                    label="" type="number" step="0.01" min="0"
                    value={String(e.custo)}
                    onChange={(ev) => updateEmbCusto(e.id, Number(ev.target.value) || 0)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-end gap-2 p-3 border border-dashed border-gold-line rounded-lg">
          <div className="w-32">
            <Input label="Tamanho (ml)" type="number" min="1" value={novaEmb.tamanho} onChange={(e) => setNovaEmb({ ...novaEmb, tamanho: e.target.value })} />
          </div>
          <div className="w-28">
            <Input label="Custo R$" type="number" step="0.01" min="0" value={novaEmb.custo} onChange={(e) => setNovaEmb({ ...novaEmb, custo: e.target.value })} />
          </div>
          <Button type="button" size="sm" onClick={addEmbalagem}>Adicionar</Button>
        </div>
      </section>
    </div>
  )
}
