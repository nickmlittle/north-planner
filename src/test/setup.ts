import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
// The app tests exercise the local budget flow. Keep credentials from a
// developer's .env file from sending these tests through live Supabase auth.
vi.mock('../state/supabase', () => ({ supabase: null }))
// Plan collapse state persists per tab; keep each test starting expanded.
afterEach(() => { if (typeof window !== 'undefined') window.sessionStorage.clear() })
