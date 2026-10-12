// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const auth = vi.hoisted(() => ({
  signInWithPasskey: vi.fn(),
  signInWithOAuth: vi.fn(),
  signInWithOtp: vi.fn(),
}))
vi.mock('../state/supabase', () => ({ supabase: { auth } }))
import { AccountAccess } from './AccountAccess'

beforeEach(() => {
  Object.defineProperty(window, 'PublicKeyCredential', { configurable: true, value: class {} })
  auth.signInWithPasskey.mockReset().mockResolvedValue({ error: null })
  auth.signInWithOAuth.mockReset().mockResolvedValue({ error: null })
  auth.signInWithOtp.mockReset().mockResolvedValue({ error: null })
})
afterEach(() => { cleanup(); delete (window as Window & { PublicKeyCredential?: unknown }).PublicKeyCredential })

it('uses Supabase passkey sign-in as the primary entry point', async () => {
  render(<AccountAccess />)
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with a passkey' }))
  await waitFor(() => expect(auth.signInWithPasskey).toHaveBeenCalledOnce())
})

it('starts Google OAuth and returns to the app root', async () => {
  render(<AccountAccess />)
  fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
  await waitFor(() => expect(auth.signInWithOAuth).toHaveBeenCalledWith({
    provider: 'google', options: { redirectTo: 'http://localhost:3000/' },
  }))
})

it('keeps email links available as an explicit recovery option', async () => {
  render(<AccountAccess />)
  fireEvent.click(screen.getByRole('button', { name: 'Use an email sign-in link' }))
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'alex@example.com' } })
  fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in link' }))
  await waitFor(() => expect(auth.signInWithOtp).toHaveBeenCalledWith({
    email: 'alex@example.com', options: { emailRedirectTo: 'http://localhost:3000/' },
  }))
  expect(await screen.findByRole('status')).toHaveTextContent('Check your email for a sign-in link')
})

it('explains when the browser does not support passkeys', () => {
  delete (window as Window & { PublicKeyCredential?: unknown }).PublicKeyCredential
  render(<AccountAccess />)
  expect(screen.getByRole('button', { name: 'Sign in with a passkey' })).toBeDisabled()
  expect(screen.getByText(/Passkeys aren’t supported in this browser/)).toBeVisible()
})
