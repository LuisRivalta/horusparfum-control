import { describe, it, expect } from 'vitest'
import {
  chaveAnuncio, custoAnuncio, tituloPadrao, descricaoPadrao, limparDescricao,
  fotosDoAnuncio, quantidadeDisponivel, pendencias, bloqueia, type Foto,
} from '@/lib/anuncios'
import type { ListaInsumos } from '@/lib/insumos'

const listas: ListaInsumos[] = [
  { tipo: 'decant', tamanhoMl: 10, itens: [{ insumoId: 'a', quantidade: 1 }] },
  { tipo: 'envio_decant', tamanhoMl: null, itens: [{ insumoId: 'b', quantidade: 1 }] },
  { tipo: 'frasco', tamanhoMl: null, itens: [{ insumoId: 'c', quantidade: 2 }] },
  { tipo: 'envio_frasco', tamanhoMl: null, itens: [{ insumoId: 'd', quantidade: 1 }] },
]
const custos = { a: 3, b: 4, c: 1.5, d: 6 }
const frasco = { tipo: 'frasco' as const, ml: null }
const dec = (ml: number) => ({ tipo: 'decant' as const, ml })

describe('anuncios', () => {
  it('chaves', () => {
    expect(chaveAnuncio(frasco)).toBe('frasco')
    expect(chaveAnuncio(dec(5))).toBe('decant-5')
    expect(chaveAnuncio(dec(2.5))).toBe('decant-2.5')
  })
  it('custo do decant usa o ml do frasco', () => {
    expect(custoAnuncio({ custoMedio: 180, volumeMl: 100 }, dec(10), listas, custos)).toEqual({ custo: 25 })
  })
  it('custo do frasco soma kit do frasco e envio do frasco', () => {
    expect(custoAnuncio({ custoMedio: 100, volumeMl: 100 }, frasco, listas, custos)).toEqual({ custo: 109 })
  })
  it('bloqueia sem custo médio e decant sem volume', () => {
    expect(custoAnuncio({ custoMedio: 0, volumeMl: 100 }, frasco, listas, custos)).toEqual({ bloqueio: 'Perfume sem custo médio' })
    expect(custoAnuncio({ custoMedio: 10, volumeMl: null }, dec(10), listas, custos)).toEqual({ bloqueio: 'Perfume sem volume (ml)' })
  })
  it('título padrão', () => {
    const f = { marca: 'Lattafa', nome: 'Asad', tipoPerfume: 'Eau de Parfum', genero: 'Masculino' }
    expect(tituloPadrao(f, dec(2.5), 100)).toBe('Decant Lattafa Asad EDP 2,5ml Masculino')
    expect(tituloPadrao(f, frasco, 100)).toBe('Perfume Lattafa Asad Eau de Parfum 100ml Masculino')
    expect(tituloPadrao({ ...f, genero: undefined }, frasco, 100)).toBe('Perfume Lattafa Asad Eau de Parfum 100ml')
    expect(tituloPadrao({ ...f, nome: 'x'.repeat(200) }, frasco, 100)).toHaveLength(150)
  })
  it('descrição troca placeholders e limpa emoji', () => {
    expect(descricaoPadrao('Olá {marca} 😀 <b>{x}</b>', { marca: 'Lattafa' })).toBe('Olá Lattafa  b/b')
    expect(descricaoPadrao('', { marca: 'L', perfume: 'A', notas: '' })).toBe('Marca: L\nPerfume: A')
    expect(limparDescricao('a🌸b<c>')).toBe('abc')
  })
  it('fotos do decant = frasco + decant, máx 12', () => {
    const fotos: Foto[] = [
      { id: '1', url: 'd1', uso: 'decant', ordem: 0 },
      { id: '2', url: 'f2', uso: 'frasco', ordem: 1 },
      { id: '3', url: 'f1', uso: 'frasco', ordem: 0 },
    ]
    expect(fotosDoAnuncio(fotos, frasco)).toEqual(['f1', 'f2'])
    expect(fotosDoAnuncio(fotos, dec(5))).toEqual(['f1', 'f2', 'd1'])
    const muitas = Array.from({ length: 15 }, (_, i): Foto => ({ id: `${i}`, url: `u${i}`, uso: 'frasco', ordem: i }))
    expect(fotosDoAnuncio(muitas, frasco)).toHaveLength(12)
  })
  it('quantidade do decant soma aberto e lacrados', () => {
    const p = (e: number) => ({ estoqueAtual: e, volumeMl: 100 })
    expect(quantidadeDisponivel(p(0), 5, dec(10))).toBe(0)
    expect(quantidadeDisponivel(p(0), 5, dec(5))).toBe(1)
    expect(quantidadeDisponivel(p(1), 5, dec(10))).toBe(10)
    expect(quantidadeDisponivel(p(-3), 5, frasco)).toBe(0)
  })
  it('pendências bloqueiam sem fotos e avisam sem gtin', () => {
    const ficha = { BRAND: { value_name: 'L' }, PERFUME_NAME: { value_name: 'A' }, UNIT_VOLUME: { value_name: '100 ml' } }
    const ok = { titulo: 't', descricao: 'd', fotos: ['u'], ficha, gtin: null, tipo: 'frasco' as const, preco: 10 }
    const p = pendencias(ok)
    expect(bloqueia(p)).toBe(false)
    expect(p.some((x) => x.includes('código de barras'))).toBe(true)
    expect(p.some((x) => x.includes('fundo branco'))).toBe(true)
    const q = pendencias({ ...ok, fotos: [] })
    expect(q).toContain('Sem fotos')
    expect(bloqueia(q)).toBe(true)
    expect(bloqueia(pendencias({ ...ok, ficha: {} }))).toBe(true)
  })
})
