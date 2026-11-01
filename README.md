# North Planner

North is a household budget planner. Set up a household with a name and at least one adult, then plan net income, monthly allocations, destinations, and transfers.

## Run locally

Requires Node 22.22.2 or later. Run `npm install`, then `npm run dev`. Run `npm run check` for lint, tests, and a production build.

Without Supabase environment variables, budgets save in this browser under `north.budget.v1`. With `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, the app uses sign-in and the `public.budgets` table. Apply the SQL migrations in `supabase/migrations` before using account saving. Cloud saves use a revision to detect edits from another device, with a browser pending copy when a save fails.

The earlier household forecast data is not read or modified by this budget app. It remains in its original browser storage keys and `public.households` table.
