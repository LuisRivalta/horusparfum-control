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
    expect(dialog).toHaveAttribute('data-lenis-prevent')
    expect(body).toHaveAttribute('data-lenis-prevent')
  })


  it('usa espacamento responsivo seguro para telas mobile', () => {
    render(
      <Modal open onClose={vi.fn()} title='Titulo responsivo'>
        <div>Conteudo</div>
      </Modal>,
    )

    const title = screen.getByRole('heading', { name: /titulo responsivo/i })
    const body = screen.getByText('Conteudo').parentElement
    const header = title.parentElement
    const dialog = title.closest('dialog')

    expect(dialog).toHaveClass('mx-3')
    expect(dialog).toHaveClass('sm:mx-auto')
    expect(header).toHaveClass('px-4')
    expect(header).toHaveClass('sm:px-6')
    expect(title).toHaveClass('text-xl')
    expect(title).toHaveClass('sm:text-2xl')
    expect(body).toHaveClass('p-4')
    expect(body).toHaveClass('sm:p-6')
  })
})
