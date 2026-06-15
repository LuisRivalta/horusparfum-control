// frontend/src/pages/estoque/__tests__/AbrirFrascoModal.test.tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AbrirFrascoModal } from '../decants/AbrirFrascoModal'

const mockOnClose = vi.fn()
const mockOnSaved = vi.fn()

// jsdom não implementa <dialog>
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  })
})

const updateMock = vi.fn(() => ({
  eq: vi.fn(() => Promise.resolve({ error: null })),
}))
const insertMock = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'produtos') {
        return {
          select: vi.fn(() => ({
            gt: vi.fn(() => ({
              order: vi.fn(() =>
                Promise.resolve({
                  data: [{ id: 'p1', nome: 'Asad', volume_ml: 100, estoque_atual: 3 }],
                  error: null,
                })
              ),
            })),
          })),
          update: updateMock,
        }
      }
      // frascos_abertos
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
        insert: insertMock,
      }
    }),
  },
}))

describe('AbrirFrascoModal', () => {
  it('lista produtos disponíveis no select', async () => {
    render(<AbrirFrascoModal onClose={mockOnClose} onSaved={mockOnSaved} />)
    await waitFor(() => expect(screen.getByText('Asad')).toBeInTheDocument())
  })

  it('mostra o volume ao selecionar produto', async () => {
    render(<AbrirFrascoModal onClose={mockOnClose} onSaved={mockOnSaved} />)
    await waitFor(() => screen.getByText('Asad'))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'p1' } })
    expect(screen.getByText(/100ml/)).toBeInTheDocument()
  })

  it('chama onSaved após confirmar abertura', async () => {
    render(<AbrirFrascoModal onClose={mockOnClose} onSaved={mockOnSaved} />)
    await waitFor(() => screen.getByText('Asad'))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'p1' } })
    fireEvent.click(screen.getByText('Confirmar'))
    await waitFor(() => expect(mockOnSaved).toHaveBeenCalled())
  })
})
