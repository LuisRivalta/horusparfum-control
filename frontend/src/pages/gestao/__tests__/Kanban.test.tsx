import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { escolher } from '@/test/escolher'
import { Kanban } from '../Kanban'

const chamadas: { op: string; args: unknown[] }[] = []
let tarefas: unknown[] = []

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const b: Record<string, unknown> = {}
      for (const op of ['select', 'order', 'eq', 'insert', 'update', 'delete']) {
        b[op] = (...args: unknown[]) => { chamadas.push({ op, args }); return b }
      }
      b.then = (res: (v: unknown) => unknown) => res({ data: tarefas, error: null })
      return b
    },
  },
}))

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})

beforeEach(() => {
  chamadas.length = 0
  tarefas = [
    { id: 'a', titulo: 'Higienizar a loja', descricao: 'balcão', prazo: '2020-01-01', status: 'a_fazer', prioridade: 'media', ordem: 1 },
    { id: 'b', titulo: 'Story Asad', descricao: null, prazo: null, status: 'a_fazer', prioridade: 'media', ordem: 3 },
    { id: 'c', titulo: 'Pedido no ML', descricao: null, prazo: '2020-01-01', status: 'feito', prioridade: 'media', ordem: 1 },
    { id: 'd', titulo: 'Repor decants', descricao: null, prazo: null, status: 'a_fazer', prioridade: 'alta', ordem: 9 },
  ]
})

const op = (nome: string) => chamadas.filter((c) => c.op === nome)

describe('Kanban', () => {
  it('mostra os cartões nas colunas e marca o atrasado fora de Feito', async () => {
    render(<Kanban />)
    const aFazer = await screen.findByRole('region', { name: 'A fazer' })
    await within(aFazer).findByText('Higienizar a loja')
    expect(within(aFazer).getByText('Story Asad')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Feito' })).getByText('Pedido no ML')).toBeTruthy()
    expect(screen.getAllByText(/Atrasado/)).toHaveLength(1)
  })

  it('cria tarefa em A fazer, no fim', async () => {
    render(<Kanban />)
    await screen.findByText('Story Asad')
    fireEvent.click(screen.getByRole('button', { name: /Nova tarefa/ }))
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: '  Postar story  ' } })
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Asad' } })
    fireEvent.change(screen.getByLabelText('Prazo'), { target: { value: '2026-12-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(op('insert')[0]?.args[0]).toEqual(
      { titulo: 'Postar story', descricao: 'Asad', prazo: '2026-12-01', prioridade: 'media', status: 'a_fazer', ordem: 4 }))
  })

  it('Alta fica em cima na coluna e mostra o selo', async () => {
    render(<Kanban />)
    const aFazer = await screen.findByRole('region', { name: 'A fazer' })
    await within(aFazer).findByText('Repor decants')
    const titulos = within(aFazer).getAllByRole('article').map((a) => a.querySelector('p')?.textContent)
    expect(titulos).toEqual(['Repor decants', 'Higienizar a loja', 'Story Asad'])
    expect(within(aFazer).getByText('Alta')).toBeTruthy()
  })

  it('escolher Alta ao criar grava a prioridade', async () => {
    render(<Kanban />)
    await screen.findByText('Story Asad')
    fireEvent.click(screen.getByRole('button', { name: /Nova tarefa/ }))
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Urgente' } })
    escolher(screen.getByRole('combobox', { name: 'Prioridade' }), 'alta')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(op('insert')[0]?.args[0]).toMatchObject({ prioridade: 'alta', ordem: 10 }))
  })

  it('título só com espaços não salva', async () => {
    render(<Kanban />)
    await screen.findByText('Story Asad')
    fireEvent.click(screen.getByRole('button', { name: /Nova tarefa/ }))
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
    expect(op('insert')).toHaveLength(0)
  })

  it('botão → move para Fazendo', async () => {
    render(<Kanban />)
    fireEvent.click(await screen.findByRole('button', { name: 'Mover Story Asad para Fazendo' }))
    await waitFor(() => expect(op('update')[0]?.args[0]).toEqual({ status: 'fazendo', ordem: 0 }))
  })

  it('soltar sobre um cartão grava a ordem entre os vizinhos; sobre ele mesmo não grava', async () => {
    render(<Kanban />)
    const feito = (await screen.findByText('Pedido no ML')).closest('article')!
    const story = screen.getByText('Story Asad').closest('article')!
    fireEvent.dragStart(story)
    fireEvent.drop(story)
    expect(op('update')).toHaveLength(0)
    fireEvent.dragStart(story)
    fireEvent.drop(feito)
    await waitFor(() => expect(op('update')[0]?.args[0]).toEqual({ status: 'feito', ordem: 0 }))
    const higienizar = screen.getByText('Higienizar a loja').closest('article')!
    fireEvent.dragStart(higienizar)
    fireEvent.drop(screen.getByRole('region', { name: 'Fazendo' }))
    await waitFor(() => expect(op('update')[1]?.args[0]).toEqual({ status: 'fazendo', ordem: 0 }))
  })

  it('edita e exclui com confirmação', async () => {
    render(<Kanban />)
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Story Asad' }))
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Story Asad Bourbon' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(op('update')[0]?.args[0]).toEqual({ titulo: 'Story Asad Bourbon', descricao: null, prazo: null, prioridade: 'media' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Editar Higienizar a loja' }))
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }))
    expect(op('delete')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
    await waitFor(() => expect(op('delete')).toHaveLength(1))
  })
})
