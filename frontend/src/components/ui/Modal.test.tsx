import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

describe('Modal', () => {
  it('focuses the first button, keeps Tab inside, and closes on Escape', async () => {
    const onClose = vi.fn()
    render(
      <>
        <button>outside</button>
        <Modal open onClose={onClose} title="Sure?" footer={<><button>Cancel</button><button>OK</button></>}>Body</Modal>
      </>,
    )
    const user = userEvent.setup()
    expect(screen.getByRole('dialog', { name: 'Sure?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'OK' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus() // wrapped, not "outside"
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders nothing when closed', () => {
    render(<Modal open={false} onClose={() => {}} title="Hidden">x</Modal>)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
