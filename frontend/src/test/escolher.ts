import { fireEvent } from '@testing-library/react'

/** Abre o Select (FormControls) e clica na opção com esse value. */
export function escolher(seletor: HTMLElement, value: string) {
  fireEvent.click(seletor)
  const opcao = document.querySelector<HTMLElement>(`[role="option"][data-value="${value}"]`)
  if (!opcao) throw new Error(`opção "${value}" não encontrada`)
  fireEvent.click(opcao)
}

/** Abre o Select, devolve o texto das opções e fecha de novo. */
export function opcoes(seletor: HTMLElement): string[] {
  fireEvent.click(seletor)
  const textos = [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent ?? '')
  fireEvent.click(seletor)
  return textos
}
