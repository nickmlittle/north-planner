# North Planner

North is a household budget planner. Set up a household, add recurring income sources, then plan budget items by category, funding rule, and destination account or pot. A new budget starts with no accounts, categories, pots, items, or income sources.

Budget snapshots and income histories use independent calendar-month effective dates. Editing an inherited budget creates a snapshot for that month; later snapshots remain independent. Income changes affect available money and, for employment sources, income-ratio funding.

## Run locally

Requires Node 22.22.2 or later. Run `npm install`, then `npm run dev`. Run `npm run check` for lint, tests, and a production build.

Without Supabase environment variables, budgets save in this browser under `north.budget.v3`. With `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, the app uses sign-in and the existing `public.budgets` table. Apply the SQL migrations in `supabase/migrations` before using account saving. Cloud saves use revision checks to detect edits from another device, with a browser pending copy when a save fails.

Version 2 local documents, pending drafts, and cloud documents migrate to version 3 when loaded. The source data is preserved until the migrated document is safely saved. No database reset is part of this rollout; do not run the earlier one-time reset script.

The earlier household forecast data is not read or modified by this budget app. It remains in its original browser storage keys and `public.households` table.
