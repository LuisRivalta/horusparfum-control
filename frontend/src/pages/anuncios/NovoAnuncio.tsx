import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Select } from '@/components/shared/FormControls'
import { formatBRL } from '@/lib/utils'
import {
  bloqueia, chaveAnuncio, custoAnuncio, descricaoPadrao, fotosDoAnuncio, limparDescricao, limparTitulo, pendencias,
  quantidadeDisponivel, tituloPadrao, type AlvoAnuncio, type Foto,
} from '@/lib/anuncios'
import {
  atributosCategoria, calcularPrecos, gerarTextos, publicar, qualidade, type AtributoML, type ItemPreco, type TipoML,
} from '@/lib/apiAnuncios'
import { FotosPerfume } from './FotosPerfume'
import { FichaPerfume, type Ficha } from './novo/FichaPerfume'
import { PrecosAnuncios } from './novo/PrecosAnuncios'
import { TextosAnuncios } from './novo/TextosAnuncios'
import { LateralPublicar } from './novo/LateralPublicar'
import { OQueAnunciar } from './novo/OQueAnunciar'
import { carregarBase, carregarDoProduto, type AnuncioDb, type Base, type Produto } from './novo/carregar'
import { card, editavel, fmtMl, precoEscolhido, rotulo, sigPreco, tituloSecao, type Cotacoes, type ItemAnuncio } from './novo/item'

const erroMsg = (e: unknown) => (e instanceof Error ? e.message : 'Erro inesperado')

function textosModelo(p: Produto, ficha: Ficha, modelo: string, alvo: AlvoAnuncio) {
  const v = (k: string) => ficha[k]?.value_name ?? ''
  const ml = alvo.tipo === 'decant' ? alvo.ml : p.volume_ml
  return {
    titulo: tituloPadrao({ marca: p.marca, nome: p.nome, tipoPerfume: v('PERFUME_TYPE') || undefined, genero: v('GENDER') || undefined }, alvo, p.volume_ml),
    descricao: descricaoPadrao(modelo, {
      marca: p.marca, nome: p.nome, tipo: v('PERFUME_TYPE'), volume: ml ? `${fmtMl(ml)} ml` : '',
      genero: v('GENDER'), notas: v('OLFACTORY_NOTES'), familias: v('OLFACTORY_FAMILIES'),
    }),
  }
}

function montarItens(base: Base, p: Produto, salvos: AnuncioDb[]): ItemAnuncio[] {
  const { config } = base
  const alvos: AlvoAnuncio[] = [{ tipo: 'frasco', ml: null }, ...(config.tamanhos_decant ?? []).map((ml) => ({ tipo: 'decant' as const, ml }))]
  for (const a of salvos) if (!alvos.some((x) => chaveAnuncio(x) === chaveAnuncio(a))) alvos.push({ tipo: a.tipo, ml: a.ml })
  return alvos.map((alvo) => {
    const chave = chaveAnuncio(alvo)
    const s = salvos.find((a) => chaveAnuncio(a) === chave)
    const c = custoAnuncio({ custoMedio: p.custo_medio, volumeMl: p.volume_ml }, alvo, base.listas, base.custoPorInsumo)
    const bloqueio = 'bloqueio' in c ? c.bloqueio : null
    const t = textosModelo(p, p.ficha, config.modelo_descricao ?? '', alvo)
    return {
      chave, alvo, bloqueio, marcado: !bloqueio, custo: 'custo' in c ? c.custo : null,
      margem: s?.margem ?? config.margem_padrao, listingType: s?.listing_type ?? config.tipo_padrao,
      titulo: s?.titulo ?? t.titulo, descricao: s?.descricao ?? t.descricao,
      id: s?.id, status: s?.status, permalink: s?.permalink, erro: s?.erro,
    }
  })
}

export function NovoAnuncio() {
  const { id: idRota } = useParams()
  const [base, setBase] = useState<Base | null>(null)
  const [atributos, setAtributos] = useState<AtributoML[]>([])
  const [erroAtributos, setErroAtributos] = useState<string | null>(null)
  const [produtoId, setProdutoId] = useState(idRota ?? '')
  const [mlAberto, setMlAberto] = useState(0)
  const [ficha, setFicha] = useState<Ficha>({})
  const [origemIA, setOrigemIA] = useState<Set<string>>(new Set())
  const [gtin, setGtin] = useState('')
  const [fotos, setFotos] = useState<Foto[]>([])
  const [itens, setItens] = useState<ItemAnuncio[]>([])
  const [cotacoes, setCotacoes] = useState<Cotacoes>({})
  const [calculadoPara, setCalculadoPara] = useState('')
  const [erroPreco, setErroPreco] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)
  const [erroTexto, setErroTexto] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  // gravações da ficha/GTIN: Salvar e Publicar esperam a fila; erro nela bloqueia Publicar
  const filaFicha = useRef<Promise<unknown>>(Promise.resolve())
  const erroFichaRef = useRef<string | null>(null)
  const [erroFicha, setErroFicha] = useState<string | null>(null)
  const marcarErroFicha = (m: string | null) => { erroFichaRef.current = m; setErroFicha(m) }

  useEffect(() => {
    carregarBase().then(setBase).catch((e) => setErro(erroMsg(e)))
    atributosCategoria().then(setAtributos).catch((e) => setErroAtributos(`Atributos do ML indisponíveis: ${erroMsg(e)}`))
  }, [])

  const produto = base?.produtos.find((p) => p.id === produtoId) ?? null

  useEffect(() => {
    if (!base || !produto) return
    let vivo = true
    carregarDoProduto(produto.id).then((r) => {
      if (!vivo) return
      setMlAberto(r.mlAberto); setFicha(r.ficha); setGtin(r.gtin)
      setItens(montarItens(base, { ...produto, ficha: r.ficha }, r.anuncios))
    }).catch((e) => vivo && setErro(erroMsg(e)))
    return () => { vivo = false }
  }, [base, produto])

  const aPublicar = itens.filter((i) => i.marcado && !i.bloqueio && editavel(i))
  const pacotes = base?.pacotes

  // Recalcula só quando muda o que entra no preço (custo, margem, tipo do anúncio).
  const comCusto = aPublicar.filter((i) => i.custo != null)
  const pedido = JSON.stringify(comCusto.map((i) => ({ chave: i.chave, custo: i.custo!, margem: i.margem, tipo: i.alvo.tipo })))
  const sigs = JSON.stringify(Object.fromEntries(comCusto.map((i) => [i.chave, sigPreco(i)])))
  useEffect(() => {
    const corpo = JSON.parse(pedido) as ItemPreco[]
    if (!corpo.length || !pacotes) return
    const sig: Record<string, string> = JSON.parse(sigs)
    let vivo = true
    calcularPrecos({ itens: corpo, pacotes })
      .then((r) => {
        if (!vivo) return
        setErroPreco(null)
        setCotacoes((c) => ({ ...c, ...Object.fromEntries(r.itens.map((x) => [x.chave, { ...x, sig: sig[x.chave] }])) }))
      })
      .catch((e) => {
        if (!vivo) return
        setErroPreco(erroMsg(e))
        setCotacoes((c) => Object.fromEntries(Object.entries(c).filter(([k]) => !corpo.some((x) => x.chave === k))))
      })
      .finally(() => vivo && setCalculadoPara(pedido))
    return () => { vivo = false }
  }, [pedido, sigs, pacotes])
  const calculando = pedido !== '[]' && pedido !== calculadoPara
  const motivoPreco = calculando ? 'Calculando preço…' : erroPreco ? `Erro no preço: ${erroPreco}` : null

  const fichaCompleta = (alvo: AlvoAnuncio): Ficha => {
    const ml = alvo.tipo === 'decant' ? alvo.ml : produto?.volume_ml
    const f: Ficha = { ...ficha, BRAND: { value_id: null, value_name: produto?.marca ?? '' }, PERFUME_NAME: { value_id: null, value_name: produto?.nome ?? '' } }
    if (ml) f.UNIT_VOLUME = { value_id: null, value_name: `${ml} mL` }
    else delete f.UNIT_VOLUME
    return f
  }

  const pend = useMemo(() => Object.fromEntries(itens.map((i) => [i.chave, pendencias({
    titulo: i.titulo, descricao: i.descricao, fotos: fotosDoAnuncio(fotos, i.alvo), ficha: fichaCompleta(i.alvo),
    gtin: gtin || null, tipo: i.alvo.tipo, preco: precoEscolhido(i, cotacoes),
  })])), // eslint-disable-next-line react-hooks/exhaustive-deps
  [itens, fotos, ficha, gtin, cotacoes, produto])

  const quantidades = produto ? Object.fromEntries(itens.map((i) => [i.chave,
    quantidadeDisponivel({ estoqueAtual: produto.estoque_atual, volumeMl: produto.volume_ml }, mlAberto, i.alvo)])) : {}

  const mudar = (chave: string, patch: Partial<ItemAnuncio>) =>
    setItens((xs) => xs.map((x) => (x.chave === chave ? { ...x, ...patch } : x)))

  // Itens casam por chave (igual em todo perfume): resposta que chega depois da troca é descartada.
  const produtoAtual = useRef(produtoId)
  const mesmoProduto = (pid: string) => produtoAtual.current === pid

  function trocarProduto(id: string) {
    produtoAtual.current = id
    setProdutoId(id)
    setItens([]); setCotacoes({}); setFotos([]); setMensagem(null); setErro(null); setOrigemIA(new Set())
    marcarErroFicha(null)
  }

  function usarModelo() {
    if (!produto || !base) return
    setItens((xs) => xs.map((x) => (editavel(x) ? { ...x, ...textosModelo(produto, ficha, base.config.modelo_descricao ?? '', x.alvo) } : x)))
  }

  async function gerarIA() {
    const pid = produtoId
    setGerando(true); setErroTexto(null)
    try {
      const { textos } = await gerarTextos(pid, aPublicar.map((i) => ({ chave: i.chave, tipo: i.alvo.tipo, ml: i.alvo.ml })))
      if (!mesmoProduto(pid)) return
      const porChave = new Map(textos.map((t) => [t.chave, t]))
      setItens((xs) => xs.map((x) => {
        const t = porChave.get(x.chave)
        return t && editavel(x) ? { ...x, titulo: t.titulo, descricao: limparDescricao(t.descricao) } : x
      }))
    } catch (e) { setErroTexto(erroMsg(e)) } finally { setGerando(false) }
  }

  // Upsert por produto + tipo + ml: a linha existente (carregada com o produto) é atualizada.
  async function salvar(): Promise<string[] | null> {
    if (!base) return null
    const pid = produtoId
    const ids: string[] = []
    for (const i of aPublicar) {
      const row = {
        produto_id: pid, canal_id: base.config.canal_id, tipo: i.alvo.tipo, ml: i.alvo.ml,
        listing_type: i.listingType, margem: i.margem, custo_base: i.custo, preco: precoEscolhido(i, cotacoes),
        titulo: limparTitulo(i.titulo), descricao: limparDescricao(i.descricao), fotos: fotosDoAnuncio(fotos, i.alvo),
        status: 'rascunho', erro: null, updated_at: new Date().toISOString(),
      }
      let id: string | undefined
      if (i.id) {
        // só mexe em rascunho/erro: publicado ou pausado não volta para rascunho
        const r = await supabase.from('anuncios').update(row).eq('id', i.id).in('status', ['rascunho', 'erro']).select('id')
        if (r.error) { setErro(`Não foi possível salvar ${rotulo(i.alvo)}: ${r.error.message}`); return null }
        id = (r.data as { id: string }[] | null)?.[0]?.id
        if (!id) { setErro(`${rotulo(i.alvo)}: anúncio já publicado — não foi alterado`); return null }
      } else {
        const r = await supabase.from('anuncios').insert(row).select('id').single()
        if (r.error || !r.data) { setErro(`Não foi possível salvar ${rotulo(i.alvo)}: ${r.error?.message ?? 'sem resposta'}`); return null }
        id = (r.data as { id: string }).id
      }
      if (!mesmoProduto(pid)) return null
      ids.push(id)
      mudar(i.chave, { id, status: 'rascunho', erro: null, titulo: row.titulo, descricao: row.descricao })
    }
    return ids
  }

  async function executar(fn: () => Promise<void>) {
    setOcupado(true); setErro(null); setMensagem(null)
    try { await fn() } catch (e) { setErro(erroMsg(e)) } finally { setOcupado(false) }
  }

  const salvarRascunho = () => executar(async () => {
    await filaFicha.current
    if (await salvar()) setMensagem('Rascunho salvo.')
  })

  const publicarTudo = () => executar(async () => {
    const pid = produtoId
    await filaFicha.current // o backend lê a ficha e o GTIN do banco
    if (erroFichaRef.current) { setErro(erroFichaRef.current); return }
    const ids = await salvar()
    if (!ids) return
    const { resultados } = await publicar(ids)
    const porId = new Map(resultados.map((r) => [r.id, r]))
    const links = await supabase.from('anuncios').select('id, permalink').in('id', ids)
    if (!mesmoProduto(pid)) return
    const linkPorId = new Map(((links.data ?? []) as { id: string; permalink: string | null }[]).map((l) => [l.id, l.permalink]))
    setItens((xs) => xs.map((x) => {
      const r = x.id ? porId.get(x.id) : undefined
      return r ? { ...x, status: r.status, erro: r.erro ?? null, permalink: linkPorId.get(r.id) ?? x.permalink } : x
    }))
    const ok = resultados.filter((r) => r.status === 'publicado')
    setMensagem(`${ok.length} de ${ids.length} publicados.`)
    const notas = await Promise.allSettled(ok.map((r) => qualidade(r.id)))
    if (!mesmoProduto(pid)) return
    setItens((xs) => xs.map((x) => {
      const n = ok.findIndex((r) => r.id === x.id)
      const q = notas[n]
      return n >= 0 && q.status === 'fulfilled' ? { ...x, qualidade: q.value } : x
    }))
  })

  const podeSalvar = aPublicar.length > 0 && !motivoPreco
  const podePublicar = podeSalvar && !erroFicha && !aPublicar.some((i) => bloqueia(pend[i.chave] ?? []))
  const naLateral = itens.filter((i) => (i.marcado && !i.bloqueio) || !editavel(i))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold flex items-center gap-2">
          <span className="w-1 h-1 bg-gold rotate-45" />
          Anúncios / Novo
        </p>
        <h1 className="text-4xl tracking-tight mt-1.5">Novo anúncio</h1>
      </div>
      {erro && <div className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm" role="alert">{erro}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-6 items-start">
        <div className="flex flex-col gap-6 min-w-0">
          <section className={card} aria-label="Perfume selecionado">
            <h2 className={tituloSecao}>1 · Perfume</h2>
            <Select label="Perfume" placeholder="Digite o nome do perfume..." value={produtoId}
              options={(base?.produtos ?? []).map((p) => ({ value: p.id, label: p.marca ? `${p.nome} · ${p.marca}` : p.nome }))}
              disabled={ocupado || gerando} onChange={(e) => trocarProduto(e.target.value)} />
            {base && produtoId && !produto && <p className="text-sm text-down">Perfume não encontrado.</p>}
            <p className="text-xs text-muted">
              Não achou? <Link to="/estoque" className="text-gold hover:underline">Cadastre o perfume no Estoque</Link>
            </p>
            {produto && (
              <dl className="grid grid-cols-3 gap-3">
                {[['Lacrados', String(produto.estoque_atual)], ['Frasco aberto', `${fmtMl(mlAberto)} ml`], ['Custo médio', formatBRL(produto.custo_medio)]].map(([k, v]) => (
                  <div key={k} className="bg-surface-2 border border-line rounded-lg px-3 py-2">
                    <dt className="text-xs uppercase tracking-[.08em] text-muted">{k}</dt>
                    <dd className="font-mono text-base mt-0.5">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          {produto && itens.length > 0 && (
            <>
              <OQueAnunciar itens={itens} onMarcar={(chave, marcado) => mudar(chave, { marcado })} />
              <FichaPerfume key={produto.id} produtoId={produto.id} atributos={atributos} erroAtributos={erroAtributos}
                ficha={ficha} origemIA={origemIA} gtin={gtin} iaAtiva={!!base?.config.ia_ativa}
                horus={{ BRAND: produto.marca, PERFUME_NAME: produto.nome, UNIT_VOLUME: produto.volume_ml ? `${fmtMl(produto.volume_ml)} ml` : '' }}
                onFicha={(f, ia) => { setFicha(f); setOrigemIA(ia) }} onGtin={setGtin}
                fila={filaFicha} onErroSalvar={marcarErroFicha} />
              <PrecosAnuncios itens={aPublicar} cotacoes={cotacoes} calculando={calculando} erro={erroPreco}
                onMargem={(chave, margem) => mudar(chave, { margem })}
                onTipo={(chave, listingType: TipoML) => mudar(chave, { listingType })} />
              <section className="flex flex-col gap-2">
                <h2 className={tituloSecao}>5 · Fotos</h2>
                <FotosPerfume key={produto.id} produtoId={produto.id} onChange={setFotos} />
              </section>
              <TextosAnuncios itens={aPublicar} iaAtiva={!!base?.config.ia_ativa} gerando={gerando} erro={erroTexto}
                onChange={(chave, campo, valor) => mudar(chave, { [campo]: valor })} onGerarIA={gerarIA} onModelo={usarModelo} />
            </>
          )}
        </div>

        <LateralPublicar itens={naLateral} pendencias={pend} quantidades={quantidades} nPublicar={aPublicar.length}
          podePublicar={podePublicar} podeSalvar={podeSalvar} motivo={erroFicha ?? motivoPreco} erro={erro} ocupado={ocupado} mensagem={mensagem} onSalvar={salvarRascunho} onPublicar={publicarTudo} />
      </div>
    </div>
  )
}
