import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Cadastros } from '../Cadastros'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve({ count: 5, error: null })),
    })),
  },
}))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/estoque/cadastros" element={<Cadastros />}>
          <Route path="produtos" element={<div>stub-produtos</div>} />
          <Route path="categorias" element={<div>stub-categorias</div>} />
          <Route path="fornecedores" element={<div>stub-fornecedores</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('Cadastros (layout de abas)', () => {
  it('renderiza o título e as três abas', () => {
    renderAt('/estoque/cadastros/produtos')
    expect(screen.getByText('Cadastros')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /produtos/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /categorias/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /fornecedores/i })).toBeInTheDocument()
  })

  it('marca a aba da rota atual como ativa e renderiza a filha', () => {
    renderAt('/estoque/cadastros/categorias')
    expect(screen.getByRole('link', { name: /categorias/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('stub-categorias')).toBeInTheDocument()
  })

  it('exibe a contagem nas abas após carregar', async () => {
    renderAt('/estoque/cadastros/produtos')
    await waitFor(() => expect(screen.getAllByText('5').length).toBeGreaterThan(0))
  })
})
