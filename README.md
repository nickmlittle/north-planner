# North Planner

## Documentation

- [Product and design specification](docs/product-design-spec.md): purpose, visual identity, desktop and mobile UX, and guidance for future work.
- [Recurring and monthly budget rules](docs/recurring-monthly-budget-rules.md) and [transfer calculation rules](docs/transfer-calculation-rules.md): authoritative financial behavior.

North is a household budget planner. Set up a household, add recurring income sources, then plan budget items by category, funding rule, and destination account or pot. A new budget starts with no accounts, categories, pots, items, or income sources.

Budget snapshots and income histories use independent calendar-month effective dates. Editing an inherited budget creates a snapshot for that month; later snapshots remain independent. Income changes affect Available and, for employment sources, income-ratio funding. Editors show the affected calendar-month range before saving. Past months remain editable; shared accounts, pots and categories affect all months. See the [recurring and monthly budget rules](docs/recurring-monthly-budget-rules.md) for examples and the future shared-access design.

Transfer views show exact pounds and pence. An account's funding includes its pots; moving money into a pot afterwards is not extra funding. See the [transfer calculation rules](docs/transfer-calculation-rules.md) for responsibilities, rounding and incomplete instructions.

## Run locally

Requires Node 22.22.2 or later. Run `npm install`, then `npm run dev`. Run `npm run check` for lint, tests, and a production build.

Without Supabase environment variables, budgets save in this browser under `north.budget.v3`. With `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, the app uses sign-in and the existing `public.budgets` table. Apply the SQL migrations in `supabase/migrations` before using account saving. Cloud saves use revision checks to detect edits from another device, with a browser pending copy when a save fails.

Version 2 local documents, pending drafts, and cloud documents migrate to version 3 when loaded. The source data is preserved until the migrated document is safely saved. No database reset is part of this rollout; do not run the earlier one-time reset script.

The earlier household forecast data is not read or modified by this budget app. It remains in its original browser storage keys and `public.households` table.

## Page layout contract

Product pages use the shared `AppLayout` and `PageFrame` shell. Keep the page title and essential page context in the frame's heading, summary, and page-controls regions; put the page's main work in its body. At desktop sizes the shell fills the dynamic viewport and the body owns vertical scrolling. Workspace pages may bound a primary table or list as an internal scroll region with sticky headings. On phones and constrained heights, layouts should compact persistent context and fall back to page scrolling whenever a fixed shell would clip content. Keep dialogs and drawers independently scrollable and keyboard reachable.
