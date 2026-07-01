import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EstMarcas } from '../Marcas'

const { inserts, updates } = vi.hoisted(() => ({
  inserts: [] as unknown[],
  updates: [] as unknown[],
}))

vi.mock('react-router-dom', () => ({
  useOutletContext: () => ({ actionSlot: document.body }),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({
          data: [{ id: 'm1', nome: 'Marca cadastrada', created_at: '2026-06-30T00:00:00Z' }],
          error: null,
        })),
      })),
      insert: vi.fn((payload: unknown) => {
        inserts.push(payload)
        return Promise.resolve({ error: null })
      }),
      update: vi.fn((payload: unknown) => ({
        eq: vi.fn((column: string, value: string) => {
          updates.push({ payload, column, value })
          return Promise.resolve({ error: null })
        }),
      })),
    })),
  },
}))

beforeEach(() => {
  inserts.length = 0
  updates.length = 0
  HTMLDialogElement.prototype.showModal = vi.fn(function showModal(this: HTMLDialogElement) {
    this.open = true
  })
  HTMLDialogElement.prototype.close = vi.fn(function close(this: HTMLDialogElement) {
    this.open = false
  })
})

describe('EstMarcas', () => {
  it('renderiza marcas existentes', async () => {
    render(<EstMarcas />)
    expect(await screen.findByText('Marca cadastrada')).toBeInTheDocument()
  })

  it('cria uma nova marca', async () => {
    const user = userEvent.setup()
    render(<EstMarcas />)

    await user.click(await screen.findByRole('button', { name: /nova marca/i }))
    await user.type(screen.getByLabelText(/nome/i), 'Marca nova')
    await user.click(screen.getByRole('button', { name: /^salvar$/i }))

    await waitFor(() => expect(inserts).toHaveLength(1))
    expect(inserts[0]).toEqual({ nome: 'Marca nova' })
  })

  it('nao usa exemplos de marcas reais como placeholder', async () => {
    const user = userEvent.setup()
    render(<EstMarcas />)

    await user.click(await screen.findByRole('button', { name: /nova marca/i }))

    expect(screen.queryByPlaceholderText(/Lattafa|Armaf/i)).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('Nome da marca')).toBeInTheDocument()
  })

  it('edita uma marca existente', async () => {
    const user = userEvent.setup()
    render(<EstMarcas />)

    await screen.findByText('Marca cadastrada')
    await user.click(screen.getByRole('button', { name: /editar marca cadastrada/i }))

    const input = screen.getByLabelText(/nome/i)
    expect(input).toHaveValue('Marca cadastrada')

    await user.clear(input)
    await user.type(input, 'Marca revisada')
    await user.click(screen.getByRole('button', { name: /^salvar$/i }))

    await waitFor(() => expect(updates).toHaveLength(1))
    expect(updates[0]).toEqual({
      payload: { nome: 'Marca revisada' },
      column: 'id',
      value: 'm1',
    })
  })
})
