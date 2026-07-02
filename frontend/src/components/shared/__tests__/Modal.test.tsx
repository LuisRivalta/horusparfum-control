import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Modal } from '../Modal'


beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  })
})

describe('Modal', () => {
  it('limita a altura e deixa o corpo rolavel', () => {
    render(
      <Modal open onClose={vi.fn()} title="Titulo">
        <div>Conteudo longo</div>
      </Modal>,
    )

    const content = screen.getByText('Conteudo longo')
    const body = content.parentElement
    const dialog = content.closest('dialog')

    expect(dialog).toHaveClass('max-h-[calc(100dvh-2rem)]')
    expect(dialog).toHaveClass('overflow-hidden')
    expect(dialog).not.toHaveClass('flex')
    expect(dialog).not.toHaveClass('flex-col')
    expect(body).toHaveClass('max-h-[calc(100dvh-7rem)]')
    expect(body).toHaveClass('overflow-y-auto')
  })
})
