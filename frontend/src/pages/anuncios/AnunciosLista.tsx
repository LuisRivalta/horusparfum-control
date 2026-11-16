import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button, Select } from '@/components/shared/FormControls'
import { formatBRL } from '@/lib/utils'
import { custoAnuncio, chaveAnuncio } from '@/lib/anuncios'
import { alterarStatus, aplicarPreco, atualizarQuantidade, calcularPrecos, publicar, qualidade } from '@/lib/apiAnuncios'
import { carregarBase, type Base } from './novo/carregar'
import { fmtMl } from './novo/item'

interface Linha {
  id: string; produto_id: string; tipo: 'frasco' | 'decant'; ml: number | null; listing_type: 'gold_special' | 'gold_pro'
  margem: number | null; custo_base: number | null; preco: number | null; status: string
  permalink: string | null; erro: string | null; qualidade_score: number | null; qualidade_nivel: string | null
}
interface Sugestao { custo: number; preco?: number; erro?: string }

const erroMsg = (e: unknown) => (e instanceof Error ? e.message : 'Erro inesperado')
const num = (v: unknown) => (v == null ? null : Number(v))
const STATUS = [
  { value: '', label: 'Todos os status' }, { value: 'rascunho', label: 'Rascunho' }, { value: 'publicado', label: 'Publicado' },
  { value: 'pausado', label: 'Pausado' }, { value: 'erro', label: 'Erro' },
]

export function AnunciosLista() {
  const [base, setBase] = useState<Base | null>(null)
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [filtro, setFiltro] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ocupados, setOcupados] = useState<Set<string>>(new Set())
  const [sugestoes, setSugestoes] = useState<Record<string, Sugestao>>({})
  const [msgs, setMsgs] = useState<Record<string, string>>({})

  const carregar = useCallback(async () => {
    try {
      const [b, a] = await Promise.all([carregarBase(), supabase.from('anuncios').select('*').order('created_at', { ascending: false })])
      if (a.error) throw new Error(a.error.message)
      setBase(b)
      setLinhas(((a.data ?? []) as Linha[]).map((l) => ({
        ...l, ml: num(l.ml), margem: num(l.margem), custo_base: num(l.custo_base), preco: num(l.preco),
      })))
    } catch (e) { setErro(erroMsg(e)) }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const produto = (id: string) => base?.produtos.find((p) => p.id === id)
  const mudar = (id: string, campos: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, ...campos } : l)))

  // desabilita os botões da linha enquanto o pedido roda
  async function executar(id: string, fn: () => Promise<void>) {
    setOcupados((s) => new Set(s).add(id))
    setErro(null)
    try { await fn() } catch (e) { setErro(erroMsg(e)) } finally {
      setOcupados((s) => { const n = new Set(s); n.delete(id); return n })
    }
  }

  const custoAtual = (l: Linha): number | null => {
    const p = produto(l.produto_id)
    if (!base || !p || l.custo_base == null) return null
    const r = custoAnuncio({ custoMedio: p.custo_medio, volumeMl: p.volume_ml }, l, base.listas, base.custoPorInsumo)
    return 'custo' in r && Math.abs(r.custo - l.custo_base) > 0.01 ? r.custo : null
  }

  const recalcular = (l: Linha, custo: number) => executar(l.id, async () => {
    const r = await calcularPrecos({
      itens: [{ chave: chaveAnuncio(l), custo, margem: l.margem ?? base!.config.margem_padrao, tipo: l.tipo }],
      pacotes: base!.pacotes,
    })
    const c = r.itens[0]?.[l.listing_type]
    setSugestoes((s) => ({ ...s, [l.id]: c && 'preco' in c ? { custo, preco: c.preco } : { custo, erro: c && 'erro' in c ? c.erro : 'Sem cotação' } }))
  })

  const aplicar = (l: Linha, s: Sugestao) => executar(l.id, async () => {
    await aplicarPreco(l.id, s.preco!)
    const { error } = await supabase.from('anuncios').update({ custo_base: s.custo }).eq('id', l.id)
    if (error) throw new Error(`Preço aplicado, mas o custo base não foi salvo: ${error.message}`)
    mudar(l.id, { preco: s.preco!, custo_base: s.custo })
    setSugestoes((x) => { const n = { ...x }; delete n[l.id]; return n })
  })

  const visiveis = useMemo(() => linhas.filter((l) => !filtro || l.status === filtro), [linhas, filtro])

  return (
    <div className="flex flex-col gap-6 stagger">
      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold flex items-center gap-2">
            <span className="w-1 h-1 bg-gold rotate-45" />
            Anúncios
          </p>
          <h1 className="text-4xl tracking-tight mt-1.5">Anúncios</h1>
        </div>
        <div className="flex gap-2 items-end">
          <Select aria-label="Filtrar por status" options={STATUS} value={filtro} placeholder={false}
            onChange={(e) => setFiltro(e.target.value)} />
          <Link to="/anuncios/ligar"><Button variant="secondary">Ligar anúncios</Button></Link>
        </div>
      </div>

      {erro && <div role="alert" className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{erro}</div>}

      <div className="gold-hairline bg-surface border border-line rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-mono uppercase tracking-[.14em] text-muted">
              <th className="p-3">Perfume</th><th className="p-3">Tipo</th><th className="p-3">Anúncio</th>
              <th className="p-3">Preço</th><th className="p-3">Status</th><th className="p-3">Nota</th><th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && (
              <tr className="border-t border-line"><td colSpan={7} className="p-8 text-center text-sm text-muted">Nenhum anúncio.</td></tr>
            )}
            {visiveis.map((l) => {
              const p = produto(l.produto_id)
              const ocupado = ocupados.has(l.id)
              const novoCusto = custoAtual(l)
              const sug = sugestoes[l.id]
              const noMl = l.status === 'publicado' || l.status === 'pausado'
              return (
                <tr key={l.id} className="border-t border-line align-top">
                  <td className="p-3">{p ? `${p.marca} ${p.nome}`.trim() : '—'}</td>
                  <td className="p-3">{l.tipo === 'frasco' ? 'Frasco' : `Decant ${fmtMl(l.ml ?? 0)} ml`}</td>
                  <td className="p-3">{l.listing_type === 'gold_pro' ? 'Premium' : 'Clássico'}</td>
                  <td className="p-3 font-mono">
                    {l.preco != null ? formatBRL(l.preco) : '—'}
                    {novoCusto != null && !noMl && (
                      <div className="mt-1 text-xs text-gold font-sans">Custo mudou — edite o rascunho</div>
                    )}
                    {novoCusto != null && noMl && (
                      <div className="mt-1 text-xs text-gold font-sans">
                        Custo mudou: {formatBRL(l.custo_base!)} → {formatBRL(novoCusto)}
                        {!sug && <> — <button type="button" disabled={ocupado} className="underline cursor-pointer disabled:opacity-50" onClick={() => recalcular(l, novoCusto)}>recalcular</button></>}
                        {sug?.erro && <span className="block text-down">{sug.erro}</span>}
                        {sug?.preco != null && (
                          <Button size="sm" className="mt-1" disabled={ocupado} onClick={() => aplicar(l, sug)}>
                            Aplicar {formatBRL(sug.preco)}
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    {STATUS.find((s) => s.value === l.status)?.label ?? l.status}
                    {l.status === 'erro' && l.erro && <span className="block text-xs text-down">{l.erro}</span>}
                  </td>
                  <td className="p-3">
                    {l.qualidade_score != null || l.qualidade_nivel ? `${l.qualidade_score ?? '—'} · ${l.qualidade_nivel ?? ''}` : '—'}
                    {msgs[l.id] && <span className="block text-xs text-muted">{msgs[l.id]}</span>}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      {l.permalink && <a href={l.permalink} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost">Abrir no ML</Button></a>}
                      {noMl && (
                        <>
                          <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => executar(l.id, async () => {
                            const r = await atualizarQuantidade(l.id)
                            setMsgs((m) => ({ ...m, [l.id]: `Quantidade: ${r.quantidade}` }))
                          })}>Atualizar quantidade</Button>
                          <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => executar(l.id, async () => {
                            const pausar = l.status === 'publicado'
                            await alterarStatus(l.id, pausar ? 'paused' : 'active')
                            mudar(l.id, { status: pausar ? 'pausado' : 'publicado' })
                          })}>{l.status === 'publicado' ? 'Pausar' : 'Reativar'}</Button>
                          <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => executar(l.id, async () => {
                            const q = await qualidade(l.id)
                            mudar(l.id, { qualidade_score: q.score, qualidade_nivel: q.nivel })
                          })}>Atualizar nota</Button>
                        </>
                      )}
                      {l.status === 'erro' && novoCusto == null && (
                        <Button size="sm" disabled={ocupado} onClick={() => executar(l.id, async () => {
                          const r = (await publicar([l.id])).resultados[0]
                          if (r) mudar(l.id, { status: r.status, erro: r.erro ?? null })
                        })}>Tentar de novo</Button>
                      )}
                      {(l.status === 'rascunho' || l.status === 'erro') && (
                        <Link to={`/anuncios/${l.produto_id}`}><Button size="sm" variant="ghost">Editar rascunho</Button></Link>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
