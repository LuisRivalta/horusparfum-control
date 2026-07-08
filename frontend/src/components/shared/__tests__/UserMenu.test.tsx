import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UserMenu } from '../UserMenu'

describe('UserMenu', () => {
  it('mostra o painel admin e executa a navegacao quando autorizado', () => {
    const onAdminClick = vi.fn()

    render(
      <UserMenu
        initials="BY"
        userEmail="byhorusco@gmail.com"
        onSignOut={vi.fn()}
        showAdminLink
        onAdminClick={onAdminClick}
      />,
    )

    fireEvent.click(screen.getByTitle('byhorusco@gmail.com'))
    fireEvent.click(screen.getByRole('button', { name: /painel admin/i }))

    expect(onAdminClick).toHaveBeenCalledOnce()
  })

  it('nao mostra o painel admin para usuarios comuns', () => {
    render(
      <UserMenu
        initials="OP"
        userEmail="operador@example.com"
        onSignOut={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByTitle('operador@example.com'))

    expect(screen.queryByRole('button', { name: /painel admin/i })).not.toBeInTheDocument()
  })
})
