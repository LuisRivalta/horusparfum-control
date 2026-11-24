import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Select } from '@/components/shared/FormControls'
import { supabase } from '@/lib/supabase'
import { apiShopify, type VarianteShopify } from '@/lib/apiShopify'
import { sugerirProdutoPorNome } from '@/lib/pedidoPdfImport'
import { vendeDecant, type TipoProduto } from '@/lib/tipos'
import { carregarBase, type Produto } from './novo/carregar'
import { fmtMl } from './novo/item'

interface Escolha { produto_id: string; alvo: string } // alvo: 'frasco' ou 'decant-<ml>'
const erroMsg = (e: unknown) => (e instanceof Error ? e.message : 'Erro inesperado')
const nomeProduto = (p: Produto) => `${p.marca} ${p.nome}`.trim()

export function LigarShopify() {
  const [itens, setItens] = useState<VarianteShopify[] | null>(null)
  const [proximo, setProximo] = useState<string | null>(null)
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [tipos, setTipos] = useState<TipoProduto[]>([])
  const [tamanhos, setTamanhos] = useState<number[]>([])
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>({})
  const [ocupados, setOcupados] = useState<Set<string>>(new Set())
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const decantOk = (produtoId: string) => {
    const p = produtos.find((x) => x.id === produtoId)
    return !!p && vendeDecant(p, tipos)
  }

  function sugerir(lote: VarianteShopify[], ps: Produto[], ts: TipoProduto[], tams: number[]) {
    const e: Record<string, Escolha> = {}
    for (const i of lote) {
      const s = sugerirProdutoPorNome(`${i.produto_titulo} ${i.variante_titulo}`, ps.map((p) => ({ id: p.id, nome: nomeProduto(p) })))
      const ml = Number(/(\d+(?:[.,]\d+)?)\s*ml/i.exec(i.variante_titulo)?.[1]?.replace(',', '.'))
      const p = ps.find((x) => x.id === s?.id)
      e[i.variante_id] = {
        produto_id: s?.id ?? '',
        alvo: p && vendeDecant(p, ts) && tams.includes(ml) && ml < (p.volume_ml ?? Infinity) ? `decant-${ml}` : 'frasco',
      }
    }
    setEscolhas((cur) => ({ ...cur, ...e }))
  }

  useEffect(() => {
    Promise.all([
      apiShopify.variantes(), carregarBase(),
      supabase.from('tipos_produto').select('id, nome, vende_decant'),
    ]).then(([r, b, t]) => {
      const ts = (t.data ?? []) as TipoProduto[]
      const tams = b.config.tamanhos_decant ?? []
      setProdutos(b.produtos); setTipos(ts); setTamanhos(tams)
      setItens(r.itens); setProximo(r.proximo)
      sugerir(r.itens.filter((i) => !i.vinculo), b.produtos, ts, tams)
    }).catch((e) => { setErro(erroMsg(e)); setItens([]) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function maisItens() {
    setErro(null)
    try {
      const r = await apiShopify.variantes(proximo)
      setItens((l) => [...(l ?? []), ...r.itens]); setProximo(r.proximo)
      sugerir(r.itens.filter((i) => !i.vinculo), produtos, tipos, tamanhos)
    } catch (e) { setErro(erroMsg(e)) }
  }

  const mudar = (id: string, c: Partial<Escolha>) => setEscolhas((e) => ({ ...e, [id]: { ...e[id], ...c } }))
  const ocupar = (id: string, on: boolean) =>
    setOcupados((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n })

  async function ligar(i: VarianteShopify) {
    const e = escolhas[i.variante_id]
    const decant = e.alvo.startsWith('decant-')
    const ml = decant ? Number(e.alvo.slice(7)) : null
    ocupar(i.variante_id, true); setErro(null); setAviso(null)
    try {
      const r = await apiShopify.ligar({
        variante_id: i.variante_id, produto_ext_id: i.produto_id_ext, estoque_id: i.estoque_id!,
        titulo: i.variante_titulo, produto_id: e.produto_id, tipo: decant ? 'decant' : 'frasco', ml,
      })
      setItens((l) => (l ?? []).map((x) => (x.variante_id === i.variante_id
        ? { ...x, vinculo: { produto_id: e.produto_id, tipo: decant ? 'decant' : 'frasco', ml } } : x)))
      if (r?.erros?.length) setAviso(`Ligado, mas o estoque não foi enviado: ${r.erros.join('; ')}`)
      else if (r?.ocupado) setAviso('Ligado; o estoque será enviado em instantes')
    } catch (x) { setErro(erroMsg(x)) } finally { ocupar(i.variante_id, false) }
  }

  async function desligar(i: VarianteShopify) {
    ocupar(i.variante_id, true); setErro(null)
    try {
      await apiShopify.desligar(i.variante_id)
      setItens((l) => (l ?? []).map((x) => (x.variante_id === i.variante_id ? { ...x, vinculo: null } : x)))
      sugerir([i], produtos, tipos, tamanhos)
    } catch (x) { setErro(erroMsg(x)) } finally { ocupar(i.variante_id, false) }
  }

  const opcoesTipo = (produtoId: string, atual: string) => [
    { value: 'frasco', label: 'Frasco/unidade' },
    ...(decantOk(produtoId)
      ? [...new Set([...tamanhos, ...(atual.startsWith('decant-') ? [Number(atual.slice(7))] : [])])]
        .map((m) => ({ value: `decant-${m}`, label: `Decant ${fmtMl(m)} ml` }))
      : []),
  ]

  const nomeLigado = (i: VarianteShopify) => {
    const p = produtos.find((x) => x.id === i.vinculo?.produto_id)
    const alvo = i.vinculo?.tipo === 'decant' ? `Decant ${fmtMl(Number(i.vinculo.ml))} ml` : 'Frasco/unidade'
    return `${p ? nomeProduto(p) : '?'} · ${alvo}`
  }

  return (
    <div className="flex flex-col gap-6 stagger">
      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold flex items-center gap-2">
            <span className="w-1 h-1 bg-gold rotate-45" />
            Anúncios / Shopify
          </p>
          <h1 className="text-4xl tracking-tight mt-1.5">Ligar Shopify</h1>
          <p className="text-sm text-muted mt-1">Variantes da loja e o produto do Horus que baixa o estoque delas.</p>
        </div>
        <Link to="/anuncios/config"><Button variant="secondary">Voltar</Button></Link>
      </div>

      {erro && <div role="alert" className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{erro}</div>}
      {aviso && <div role="status" className="px-3 py-2.5 rounded-lg bg-gold-dim border border-gold-line text-sm">{aviso}</div>}
      {itens === null && <p className="text-sm text-muted">Carregando...</p>}

      <div className="gold-hairline bg-surface border border-line rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-mono uppercase tracking-[.14em] text-muted">
              <th className="p-3">Produto / variante</th><th className="p-3">Perfume</th><th className="p-3">Tipo</th><th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {itens?.length === 0 && (
              <tr className="border-t border-line"><td colSpan={4} className="p-8 text-center text-sm text-muted">Nenhuma variante na loja.</td></tr>
            )}
            {(itens ?? []).map((i) => {
              const ocupado = ocupados.has(i.variante_id)
              const e = escolhas[i.variante_id]
              const nome = `${i.produto_titulo} ${i.variante_titulo}`
              return (
                <tr key={i.variante_id} className="border-t border-line align-top">
                  <td className="p-3">{i.produto_titulo}
                    <span className="block text-xs text-muted">{i.variante_titulo}</span></td>
                  {i.vinculo ? (
                    <>
                      <td className="p-3 text-up" colSpan={2}>Ligado: {nomeLigado(i)}</td>
                      <td className="p-3 text-right">
                        <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => desligar(i)}>Desligar</Button>
                      </td>
                    </>
                  ) : e && (
                    <>
                      <td className="p-3 min-w-56">
                        <Select aria-label={`Perfume de ${nome}`} value={e.produto_id}
                          options={produtos.map((p) => ({ value: p.id, label: nomeProduto(p) }))}
                          onChange={(ev) => mudar(i.variante_id, { produto_id: ev.target.value, alvo: 'frasco' })} />
                      </td>
                      <td className="p-3 min-w-44">
                        <Select aria-label={`Tipo de ${nome}`} value={e.alvo} placeholder={false}
                          options={opcoesTipo(e.produto_id, e.alvo)}
                          onChange={(ev) => mudar(i.variante_id, { alvo: ev.target.value })} />
                      </td>
                      <td className="p-3 text-right">
                        <Button size="sm" disabled={ocupado || !e.produto_id || !i.estoque_id} onClick={() => ligar(i)}>Ligar</Button>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {proximo && <div><Button variant="secondary" onClick={maisItens}>Carregar mais</Button></div>}
    </div>
  )
}
