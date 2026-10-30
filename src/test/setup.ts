import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'
// The app tests exercise the local planner flow. Keep credentials from a
// developer's .env file from sending these tests through live Supabase auth.
vi.mock('../state/supabase', () => ({ supabase: null }))
