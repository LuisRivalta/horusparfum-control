import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Select } from '@/components/shared/FormControls'
import { formatBRL } from '@/lib/utils'
import { itensDaConta, ligarAnuncio, type ItemConta } from '@/lib/apiAnuncios'
import { sugerirProdutoPorNome } from '@/lib/pedidoPdfImport'
import { carregarBase, type Produto } from './novo/carregar'
import { fmtMl } from './novo/item'

interface Escolha { produto_id: string; alvo: string } // alvo: 'frasco' ou 'decant-<ml>'
const erroMsg = (e: unknown) => (e instanceof Error ? e.message : 'Erro inesperado')
const nomeProduto = (p: Produto) => `${p.marca} ${p.nome}`.trim()

function alvoSugerido(item: ItemConta, p?: Produto): string {
  return p?.volume_ml && item.volume_ml && item.volume_ml < p.volume_ml ? `decant-${item.volume_ml}` : 'frasco'
}

export function LigarAnuncios() {
  const [itens, setItens] = useState<ItemConta[] | null>(null)
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>({})
  const [ocupados, setOcupados] = useState<Set<string>>(new Set())
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([itensDaConta(), carregarBase()]).then(([r, b]) => {
      const livres = r.itens.filter((i) => !i.ligado)
      const ps = b.produtos
      setProdutos(ps)
      setItens(livres)
      const e: Record<string, Escolha> = {}
      for (const i of livres) {
        const s = sugerirProdutoPorNome(i.titulo, ps.map((p) => ({ id: p.id, nome: nomeProduto(p) })))
        e[i.ml_item_id] = { produto_id: s?.id ?? '', alvo: alvoSugerido(i, ps.find((p) => p.id === s?.id)) }
      }
      setEscolhas(e)
    }).catch((e) => { setErro(erroMsg(e)); setItens([]) })
  }, [])

  const mudar = (id: string, c: Partial<Escolha>) => setEscolhas((e) => ({ ...e, [id]: { ...e[id], ...c } }))

  async function ligar(i: ItemConta) {
    const e = escolhas[i.ml_item_id]
    setOcupados((s) => new Set(s).add(i.ml_item_id))
    setErro(null)
    try {
      const decant = e.alvo.startsWith('decant-')
      await ligarAnuncio({
        ml_item_id: i.ml_item_id, produto_id: e.produto_id,
        tipo: decant ? 'decant' : 'frasco', ml: decant ? Number(e.alvo.slice(7)) : null,
      })
      setItens((l) => (l ?? []).filter((x) => x.ml_item_id !== i.ml_item_id))
    } catch (x) { setErro(erroMsg(x)) } finally {
      setOcupados((s) => { const n = new Set(s); n.delete(i.ml_item_id); return n })
    }
  }

  const tamanhos = (e: Escolha, i: ItemConta) => {
    const ml = new Set<number>(i.volume_ml ? [i.volume_ml] : [])
    if (e.alvo.startsWith('decant-')) ml.add(Number(e.alvo.slice(7)))
    return [{ value: 'frasco', label: 'Frasco' }, ...[...ml].map((m) => ({ value: `decant-${m}`, label: `Decant ${fmtMl(m)} ml` }))]
  }

  return (
    <div className="flex flex-col gap-6 stagger">
      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold flex items-center gap-2">
            <span className="w-1 h-1 bg-gold rotate-45" />
            Anúncios / Ligar
          </p>
          <h1 className="text-4xl tracking-tight mt-1.5">Ligar anúncios</h1>
          <p className="text-sm text-muted mt-1">Anúncios que já estão no Mercado Livre e ainda não têm perfume no Horus.</p>
        </div>
        <Link to="/anuncios"><Button variant="secondary">Voltar</Button></Link>
      </div>

      {erro && <div role="alert" className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{erro}</div>}
      {itens === null && <p className="text-sm text-muted">Carregando...</p>}

      <div className="gold-hairline bg-surface border border-line rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-mono uppercase tracking-[.14em] text-muted">
              <th className="p-3">Anúncio no ML</th><th className="p-3">Preço</th><th className="p-3">Perfume</th><th className="p-3">Tipo</th><th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {itens?.length === 0 && (
              <tr className="border-t border-line"><td colSpan={5} className="p-8 text-center text-sm text-muted">Nenhum anúncio para ligar.</td></tr>
            )}
            {(itens ?? []).map((i) => {
              const e = escolhas[i.ml_item_id]
              if (!e) return null
              const ocupado = ocupados.has(i.ml_item_id)
              return (
                <tr key={i.ml_item_id} className="border-t border-line align-top">
                  <td className="p-3">{i.titulo}<span className="block text-xs text-muted font-mono">{i.ml_item_id}</span></td>
                  <td className="p-3 font-mono">{formatBRL(i.preco)}</td>
                  <td className="p-3 min-w-56">
                    <Select aria-label={`Perfume de ${i.titulo}`} value={e.produto_id}
                      options={produtos.map((p) => ({ value: p.id, label: nomeProduto(p) }))}
                      onChange={(ev) => mudar(i.ml_item_id, { produto_id: ev.target.value, alvo: alvoSugerido(i, produtos.find((p) => p.id === ev.target.value)) })} />
                  </td>
                  <td className="p-3 min-w-44">
                    <Select aria-label={`Tipo de ${i.titulo}`} value={e.alvo} placeholder={false}
                      options={tamanhos(e, i)} onChange={(ev) => mudar(i.ml_item_id, { alvo: ev.target.value })} />
                  </td>
                  <td className="p-3 text-right">
                    <Button size="sm" disabled={ocupado || !e.produto_id} onClick={() => ligar(i)}>Ligar</Button>
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
