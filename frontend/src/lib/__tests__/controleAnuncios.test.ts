import { describe, it, expect } from 'vitest'
import {
  variantesDo,
  montarLinhas,
  filtrarLinhas,
  paraMarcarTodas,
  type ProdutoControle,
  type Marca,
} from '../controleAnuncios'

const tam = [2.5, 5, 10]

function produto(over: Partial<ProdutoControle> = {}): ProdutoControle {
  return { id: 'p1', nome: 'Produto', estoque_atual: 5, vende_decant: true, ml_aberto: null, ...over }
}
const marca = (over: Partial<Marca> = {}): Marca => ({
  produto_id: 'p1', canal: 'ml', tipo: 'frasco', ml: null, ...over,
})
const linha = (p: ProdutoControle, man: Marca[] = [], aut: Marca[] = []) =>
  montarLinhas([p], 'ml', tam, man, aut)[0]
const todas = [
  marca(),
  marca({ tipo: 'decant', ml: 2.5 }),
  marca({ tipo: 'decant', ml: 5 }),
  marca({ tipo: 'decant', ml: 10 }),
]

describe('variantesDo', () => {
  it('frasco + decants quando vende decant', () => {
    expect(variantesDo(produto(), tam)).toEqual([
      { tipo: 'frasco', ml: null },
      { tipo: 'decant', ml: 2.5 },
      { tipo: 'decant', ml: 5 },
      { tipo: 'decant', ml: 10 },
    ])
  })
  it('só frasco quando não vende decant', () => {
    expect(variantesDo(produto({ vende_decant: false }), tam)).toEqual([{ tipo: 'frasco', ml: null }])
  })
})

describe('montarLinhas', () => {
  it('verde por marca manual tem manual:true', () => {
    const c = linha(produto({ vende_decant: false }), [marca()]).celulas[0]
    expect(c).toMatchObject({ estado: 'verde', manual: true })
  })
  it('verde por automática tem manual:false', () => {
    const c = linha(produto({ vende_decant: false }), [], [marca()]).celulas[0]
    expect(c).toMatchObject({ estado: 'verde', manual: false })
  })
  it('manual + automática => manual:false', () => {
    const c = linha(produto({ vende_decant: false }), [marca()], [marca()]).celulas[0]
    expect(c).toMatchObject({ estado: 'verde', manual: false })
  })
  it('ml como string casa', () => {
    const l = linha(produto(), [], [{ ...marca(), tipo: 'decant', ml: '5' as unknown as number }])
    expect(l.celulas[2].estado).toBe('verde')
  })
  it('marca de outro canal não conta', () => {
    expect(linha(produto({ vende_decant: false }), [marca({ canal: 'shopify' })]).celulas[0].estado).toBe('vermelha')
  })
  it('cinza e vermelha por estoque', () => {
    expect(linha(produto({ estoque_atual: 0, vende_decant: false })).celulas[0].estado).toBe('cinza')
    const l = linha(produto({ estoque_atual: 0, ml_aberto: 8 }))
    expect(l.celulas.map((c) => c.estado)).toEqual(['cinza', 'vermelha', 'vermelha', 'cinza'])
  })
  it('decant com lacrado e sem frasco aberto é vermelha', () => {
    const l = linha(produto({ estoque_atual: 1, ml_aberto: null }))
    expect(l.celulas[3].estado).toBe('vermelha')
  })
  it('estado do perfume', () => {
    expect(linha(produto(), todas).estado).toBe('completo')
    expect(linha(produto({ estoque_atual: 0 }), [marca()]).estado).toBe('aguardando')
    expect(linha(produto({ estoque_atual: 0 })).estado).toBe('aguardando')
    expect(linha(produto(), [marca()]).estado).toBe('incompleto')
    expect(linha(produto()).estado).toBe('sem_anuncio')
    expect(linha(produto({ estoque_atual: 0, ml_aberto: 8 })).estado).toBe('sem_anuncio')
  })
  it('ordena por nome pt-BR', () => {
    const r = montarLinhas([produto({ id: 'a', nome: 'Zeta' }), produto({ id: 'b', nome: 'Álamo' })], 'ml', tam, [], [])
    expect(r.map((x) => x.produto.nome)).toEqual(['Álamo', 'Zeta'])
  })
})

describe('filtrarLinhas', () => {
  const ls = montarLinhas(
    [produto({ id: 'a', nome: 'Asad Bourbon' }), produto({ id: 'b', nome: 'Outro' })],
    'ml', tam, [marca({ produto_id: 'a' }), ...todas.slice(1).map((m) => ({ ...m, produto_id: 'a' }))], [],
  )
  it('por situação', () => {
    expect(filtrarLinhas(ls, 'completo', '').map((l) => l.produto.id)).toEqual(['a'])
  })
  it('busca sem acento e caixa', () => {
    expect(filtrarLinhas(ls, 'todos', 'asad')).toHaveLength(1)
    expect(filtrarLinhas(ls, 'todos', 'ASÁD')).toHaveLength(1)
  })
  it('todos + vazio devolve tudo', () => {
    expect(filtrarLinhas(ls, 'todos', '')).toHaveLength(2)
  })
})

describe('paraMarcarTodas', () => {
  it('só as vermelhas', () => {
    const l = linha(produto({ estoque_atual: 1 }), [marca()])
    expect(paraMarcarTodas(l)).toEqual([
      { tipo: 'decant', ml: 2.5 }, { tipo: 'decant', ml: 5 }, { tipo: 'decant', ml: 10 },
    ])
  })
})
