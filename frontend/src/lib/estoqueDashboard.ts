import Decimal from 'decimal.js'
import { situacaoEstoque } from './estoque'

export interface ProdutoEstoque {
  id: string
  nome: string
  estoque_atual: number
  estoque_minimo: number
  custo_medio: number | null
  categoria_id: string | null
  marca_id: string | null
}

export interface ResumoEstoque {
  produtos: number
  unidades: number
  valorTotal: number
  semCusto: number
  criticos: number
  baixos: number
  ok: number
  custoMedioUnidade: number | null
}

function valorEmEstoque(produto: ProdutoEstoque): Decimal {
  return new Decimal(produto.estoque_atual).times(produto.custo_medio ?? 0)
}

export function resumoEstoque(produtos: ProdutoEstoque[]): ResumoEstoque {
  const valor = produtos.reduce((total, p) => total.plus(valorEmEstoque(p)), new Decimal(0))
  const unidades = produtos.reduce((total, p) => total + p.estoque_atual, 0)
  const situacoes = produtos.map((p) => situacaoEstoque(p.estoque_atual, p.estoque_minimo))

  return {
    produtos: produtos.length,
    unidades,
    valorTotal: valor.toNumber(),
    semCusto: produtos.filter((p) => !p.custo_medio).length,
    criticos: situacoes.filter((s) => s === 'critico').length,
    baixos: situacoes.filter((s) => s === 'baixo').length,
    ok: situacoes.filter((s) => s === 'ok').length,
    custoMedioUnidade: unidades > 0 ? valor.dividedBy(unidades).toNumber() : null,
  }
}

export interface GrupoEstoque {
  id: string | null
  nome: string
  produtos: number
  unidades: number
  valor: number
  participacao: number
}

/**
 * Agrupa produtos por uma dimensão (categoria, marca, fornecedor) somando
 * produtos, unidades e valor, e ordena por valor decrescente.
 */
export function agruparEstoque(
  produtos: ProdutoEstoque[],
  chave: (produto: ProdutoEstoque) => string | null,
  nomes: Map<string, string>,
  rotuloSemGrupo = 'Sem categoria'
): GrupoEstoque[] {
  const grupos = new Map<string, { id: string | null; unidades: number; produtos: number; valor: Decimal }>()

  for (const produto of produtos) {
    const id = chave(produto)
    const nome = (id && nomes.get(id)) || rotuloSemGrupo
    const atual = grupos.get(nome) ?? {
      id: id && nomes.has(id) ? id : null,
      unidades: 0,
      produtos: 0,
      valor: new Decimal(0),
    }

    grupos.set(nome, {
      id: atual.id,
      produtos: atual.produtos + 1,
      unidades: atual.unidades + produto.estoque_atual,
      valor: atual.valor.plus(valorEmEstoque(produto)),
    })
  }

  const total = [...grupos.values()].reduce((soma, g) => soma.plus(g.valor), new Decimal(0))

  return [...grupos.entries()]
    .map(([nome, grupo]) => ({
      id: grupo.id,
      nome,
      produtos: grupo.produtos,
      unidades: grupo.unidades,
      valor: grupo.valor.toNumber(),
      participacao: total.isZero() ? 0 : grupo.valor.dividedBy(total).toNumber(),
    }))
    .sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome))
}

export interface ProdutoValor {
  id: string
  nome: string
  estoqueAtual: number
  valor: number
  participacao: number
}

/**
 * Produtos que concentram mais valor em estoque. A participação é sempre
 * relativa ao valor total do estoque, não ao subtotal do recorte.
 */
export function topProdutosPorValor(produtos: ProdutoEstoque[], limite: number): ProdutoValor[] {
  const total = produtos.reduce((soma, p) => soma.plus(valorEmEstoque(p)), new Decimal(0))

  return produtos
    .map((produto) => {
      const valor = valorEmEstoque(produto)

      return {
        id: produto.id,
        nome: produto.nome,
        estoqueAtual: produto.estoque_atual,
        valor: valor.toNumber(),
        participacao: total.isZero() ? 0 : valor.dividedBy(total).toNumber(),
      }
    })
    .filter((linha) => linha.valor > 0)
    .sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome))
    .slice(0, limite)
}
