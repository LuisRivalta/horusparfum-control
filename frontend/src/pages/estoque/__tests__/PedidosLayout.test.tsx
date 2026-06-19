import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { PedidosLayout } from '../PedidosLayout'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve({ count: 4, error: null })),
    })),
  },
}))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/estoque/pedidos" element={<PedidosLayout />}>
          <Route index element={<div>stub-pedidos</div>} />
          <Route path="divergencias" element={<div>stub-divergencias</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('PedidosLayout (layout de abas)', () => {
  it('renderiza o título e as duas abas', () => {
    renderAt('/estoque/pedidos')
    expect(screen.getByRole('heading', { name: 'Pedidos' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /pedidos/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /divergências/i })).toBeInTheDocument()
  })

  it('na rota index mostra a lista de pedidos e marca a aba Pedidos como ativa', () => {
    renderAt('/estoque/pedidos')
    expect(screen.getByText('stub-pedidos')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /pedidos/i })).toHaveAttribute('aria-current', 'page')
  })

  it('na rota divergencias mostra a filha e marca a aba Divergências como ativa', () => {
    renderAt('/estoque/pedidos/divergencias')
    expect(screen.getByText('stub-divergencias')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /divergências/i })).toHaveAttribute('aria-current', 'page')
  })

  it('exibe a contagem nas abas após carregar', async () => {
    renderAt('/estoque/pedidos')
    await waitFor(() => expect(screen.getAllByText('4').length).toBeGreaterThan(0))
  })
})
