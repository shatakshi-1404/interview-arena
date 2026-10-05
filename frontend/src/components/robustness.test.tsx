import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OfflineBanner } from './OfflineBanner'
import { ErrorBoundary } from './ErrorBoundary'

let shouldThrow = true
function Bomb() {
  if (shouldThrow) throw new Error('boom')
  return <p>All good</p>
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    shouldThrow = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows a friendly fallback instead of a blank page, and recovers on retry', async () => {
    render(<ErrorBoundary><Bomb /></ErrorBoundary>)
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/')

    shouldThrow = false
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByText('All good')).toBeInTheDocument()
  })

  it('clears the error when the reset key (the route) changes', () => {
    const { rerender } = render(<ErrorBoundary resetKey="/a"><Bomb /></ErrorBoundary>)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    shouldThrow = false
    rerender(<ErrorBoundary resetKey="/b"><Bomb /></ErrorBoundary>)
    expect(screen.getByText('All good')).toBeInTheDocument()
  })
})

describe('OfflineBanner', () => {
  afterEach(() => vi.restoreAllMocks())

  it('appears when the connection drops and disappears when it returns', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    render(<OfflineBanner />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    online.mockReturnValue(false)
    act(() => { fireEvent(window, new Event('offline')) })
    expect(screen.getByRole('status')).toHaveTextContent("You're offline")

    online.mockReturnValue(true)
    act(() => { fireEvent(window, new Event('online')) })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
