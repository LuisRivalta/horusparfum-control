import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Decimal from 'decimal.js'
import { Button, Select } from '@/components/shared/FormControls'
import { supabase } from '@/lib/supabase'
import { apiShopify } from '@/lib/apiShopify'
import { precoShopify } from '@/lib/canais'
import { vendeDecant, type TipoProduto } from '@/lib/tipos'
import {
  custoAnuncio, descricaoPadrao, fotosDoAnuncio, limparDescricao, limparTitulo, tituloPadrao, type AlvoAnuncio, type Foto,
} from '@/lib/anuncios'
import { formatBRL } from '@/lib/utils'
import { FotosPerfume } from './FotosPerfume'
import { carregarBase, type Base, type Produto } from './novo/carregar'
import { fmtMl } from './novo/item'

const erroMsg = (e: unknown) => (e instanceof Error ? e.message : 'Erro inesperado')
const JA_NA_SHOPIFY = 'já está na Shopify'
const SEM_CANAL = 'Canal Shopify não encontrado em Vendas › Configuração'
const nomeProduto = (p: Produto) => `${p.marca} ${p.nome}`.trim()
const rotuloAlvo = (a: AlvoAnuncio) => (a.tipo === 'frasco' ? 'Frasco/unidade' : `Decant ${fmtMl(a.ml ?? 0)} ml`)
const chave = (a: AlvoAnuncio) => (a.tipo === 'frasco' ? 'frasco' : `decant-${a.ml}`)
const numero = (s: string) => Number(s.replace(',', '.'))

export function PublicarShopify() {
  const [base, setBase] = useState<Base | null>(null)
  const [tipos, setTipos] = useState<TipoProduto[]>([])
  const [taxa, setTaxa] = useState<number | null>(null)
  const [produtoId, setProdutoId] = useState('')
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set(['frasco']))
  const [precos, setPrecos] = useState<Record<string, string>>({})
  const [fotos, setFotos] = useState<Foto[]>([])
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [semCanal, setSemCanal] = useState(false)

  useEffect(() => {
    Promise.all([
      carregarBase(),
      supabase.from('tipos_produto').select('id, nome, vende_decant'),
      supabase.from('canais').select('taxa_padrao').eq('nome', 'Shopify').maybeSingle(),
    ]).then(([b, t, c]) => {
      setBase(b); setTipos((t.data ?? []) as TipoProduto[])
      const tx = (c.data as { taxa_padrao?: number | null } | null)?.taxa_padrao
      if (c.error || tx == null) setSemCanal(true); else setTaxa(Number(tx))
    }).catch((e) => setErro(erroMsg(e)))
  }, [])

  const produto = base?.produtos.find((p) => p.id === produtoId) ?? null
  const tipoNome = tipos.find((t) => t.id === produto?.tipo_id)?.nome ?? 'Perfume'

  const linhas = useMemo(() => {
    if (!base || !produto) return []
    const alvos: AlvoAnuncio[] = [
      { tipo: 'frasco', ml: null },
      ...(vendeDecant(produto, tipos) ? (base.config.tamanhos_decant ?? []).map((ml) => ({ tipo: 'decant' as const, ml })) : []),
    ]
    return alvos.map((alvo) => {
      const c = custoAnuncio({ custoMedio: produto.custo_medio, volumeMl: produto.volume_ml }, alvo, base.listas, base.custoPorInsumo)
      const custo = 'custo' in c ? c.custo : null
      return {
        alvo, k: chave(alvo), custo, bloqueio: 'bloqueio' in c ? c.bloqueio : null,
        sugerido: custo == null ? null : taxa == null ? null : precoShopify(custo, base.config.margem_padrao, taxa),
      }
    })
  }, [base, produto, tipos, taxa])

  function escolherProduto(id: string) {
    const p = base?.produtos.find((x) => x.id === id)
    setProdutoId(id); setMarcadas(new Set(['frasco'])); setPrecos({}); setFotos([]); setOk(null); setErro(null)
    if (!p || !base) return
    const v = (k: string) => (p.ficha[k] as { value_name?: string } | undefined)?.value_name ?? ''
    const nome = tipos.find((t) => t.id === p.tipo_id)?.nome ?? 'Perfume'
    setTitulo(tituloPadrao(
      { marca: p.marca, nome: p.nome, tipoPerfume: v('PERFUME_TYPE') || undefined, genero: v('GENDER') || undefined },
      { tipo: 'frasco', ml: null }, p.volume_ml,
    ).replace(/^Perfume/, nome))
    setDescricao(descricaoPadrao(base.config.modelo_descricao ?? '', {
      marca: p.marca, nome: p.nome, tipo: v('PERFUME_TYPE'), volume: p.volume_ml ? `${fmtMl(p.volume_ml)} ml` : '',
      genero: v('GENDER'), notas: v('OLFACTORY_NOTES'), familias: v('OLFACTORY_FAMILIES'),
    }))
  }

  const precoDe = (l: (typeof linhas)[number]) => precos[l.k] ?? (l.sugerido == null ? '' : String(l.sugerido))
  const escolhidas = linhas.filter((l) => marcadas.has(l.k) && l.custo != null)
  const lucro = (l: (typeof linhas)[number]) =>
    new Decimal(numero(precoDe(l)) || 0).times(new Decimal(1).minus(new Decimal(taxa ?? 0).div(100))).minus(l.custo ?? 0).toNumber()

  async function publicar() {
    if (!produto) return
    setOcupado(true); setErro(null); setOk(null)
    try {
      const variantes = escolhidas.map((l) => ({ tipo: l.alvo.tipo, ml: l.alvo.ml, preco: numero(precoDe(l)) }))
      if (variantes.some((v) => !(v.preco > 0))) throw new Error('Informe um preço válido em cada variante marcada')
      const comDecant = escolhidas.some((l) => l.alvo.tipo === 'decant')
      const r = await apiShopify.publicar({
        produto_id: produto.id, titulo: limparTitulo(titulo), descricao: limparDescricao(descricao), variantes,
        fotos: fotosDoAnuncio(fotos, comDecant ? { tipo: 'decant', ml: 0 } : { tipo: 'frasco', ml: null }),
      })
      setOk(`Publicado na Shopify (${r.variantes} variante${r.variantes === 1 ? '' : 's'})`)
    } catch (e) { setErro(erroMsg(e)) } finally { setOcupado(false) }
  }

  const alterna = (k: string) => setMarcadas((s) => { const n = new Set(s); if (!n.delete(k)) n.add(k); return n })
  const pronto = taxa != null && !!produto && escolhidas.length > 0 && titulo.trim() !== '' && !ocupado

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4">
      <h1 className="text-xl font-semibold">Publicar na Shopify</h1>
      <Select aria-label="Produto" value={produtoId} onChange={(e) => escolherProduto(e.target.value)}
        options={(base?.produtos ?? []).map((p) => ({ value: p.id, label: nomeProduto(p) }))} />
      {produto && (
        <>
          <p className="text-sm text-muted">
            {tipoNome} · taxa do canal {taxa}% · margem {Math.round((base?.config.margem_padrao ?? 0) * 100)}%
          </p>
          <div className="flex flex-col gap-2">
            {linhas.map((l) => (
              <div key={l.k} className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex w-44 items-center gap-2">
                  <input type="checkbox" aria-label={rotuloAlvo(l.alvo)} checked={marcadas.has(l.k)}
                    disabled={l.custo == null} onChange={() => alterna(l.k)} />
                  {rotuloAlvo(l.alvo)}
                </label>
                {l.custo == null ? <span className="text-danger">{l.bloqueio}</span> : (
                  <>
                    <span>Custo {formatBRL(l.custo)}</span>
                    <input aria-label={`Preço ${rotuloAlvo(l.alvo)}`} className="w-28 rounded border px-2 py-1"
                      inputMode="decimal" value={precoDe(l)}
                      onChange={(e) => setPrecos((s) => ({ ...s, [l.k]: e.target.value }))} />
                    <span>Lucro {formatBRL(lucro(l))}</span>
                  </>
                )}
              </div>
            ))}
          </div>
          <FotosPerfume key={produto.id} produtoId={produto.id} onChange={setFotos} />
          <label className="flex flex-col gap-1 text-sm">Título
            <input className="rounded border px-2 py-1" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">Descrição
            <textarea className="min-h-32 rounded border px-2 py-1" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </label>
          <div><Button onClick={publicar} disabled={!pronto}>{ocupado ? 'Publicando…' : 'Publicar'}</Button></div>
        </>
      )}
      {semCanal && <p className="text-sm text-danger">{SEM_CANAL}</p>}
      {ok && <p className="text-sm text-green-600">{ok}</p>}
      {erro && (
        <p className="text-sm text-danger">
          {erro}{' '}
          {erro.includes(JA_NA_SHOPIFY) && <Link className="underline" to="/anuncios/shopify/ligar">Ir para Ligar Shopify</Link>}
        </p>
      )}
    </div>
  )
}
