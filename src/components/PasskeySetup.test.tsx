// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const auth = vi.hoisted(() => ({
  passkey: { list: vi.fn() },
  registerPasskey: vi.fn(),
}))
vi.mock('../state/supabase', () => ({ supabase: { auth } }))
import { PasskeySetup } from './PasskeySetup'

afterEach(() => cleanup())

it('offers registration when the signed-in account has no passkey', async () => {
  auth.passkey.list.mockResolvedValue({ data: [], error: null })
  auth.registerPasskey.mockResolvedValue({ data: { id: 'credential-1' }, error: null })
  render(<PasskeySetup />)
  fireEvent.click(await screen.findByRole('button', { name: 'Add a passkey' }))
  await waitFor(() => expect(auth.registerPasskey).toHaveBeenCalledOnce())
  expect(await screen.findByRole('status')).toHaveTextContent('Passkey added')
})

it('hides enrollment when the account already has a passkey', async () => {
  auth.passkey.list.mockResolvedValue({ data: [{ id: 'credential-1' }], error: null })
  render(<PasskeySetup />)
  await waitFor(() => expect(auth.passkey.list).toHaveBeenCalledOnce())
  expect(screen.queryByRole('button', { name: 'Add a passkey' })).not.toBeInTheDocument()
})

it('shows Supabase registration errors', async () => {
  auth.passkey.list.mockResolvedValue({ data: [], error: null })
  auth.registerPasskey.mockResolvedValue({ data: null, error: { message: 'Passkeys are disabled' } })
  render(<PasskeySetup />)
  fireEvent.click(await screen.findByRole('button', { name: 'Add a passkey' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Passkeys are disabled')
})
