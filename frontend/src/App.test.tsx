import { act } from 'react'
import { createRoot, Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('Auto Oche', () => {
  it('starts a game and submits a manual visit', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'accepted',
        announcement: 'Player 1 scored 100. 401 remaining. Player 1 to throw.',
        snapshot: {
          start_score: 501,
          players: [{ id: expect.any(String), name: 'Player 1', remaining: 401, darts_thrown: 3, visits: 1, points_scored: 100 }],
          current_player: 0,
          winner_id: null,
          turns: [],
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => { root?.render(<App />) })
    await act(async () => { (container.querySelector('button[type="submit"]') as HTMLButtonElement).click() })
    const scoreInput = container.querySelector('input[type="number"]') as HTMLInputElement
    await act(async () => { setInput(scoreInput, '100') })
    await act(async () => { (container.querySelector('.total-form button') as HTMLButtonElement).click() })

    expect(fetchMock).toHaveBeenCalledWith('/api/turns/resolve', expect.objectContaining({ method: 'POST' }))
    expect(container.textContent).toContain('401')
    expect(container.textContent).toContain('Always listening')
    expect(localStorage.getItem('auto-oche.active-game')).toContain('401')
  })
})
