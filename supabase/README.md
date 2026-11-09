# Database changes

Migrations live in `migrations/` and are applied in filename order.

## Phase 1 (`20261109000000_phase1_foundations.sql`)

Deploy these three together, in this order, because the new app code reads the new columns:

1. **Apply the migration** (Supabase SQL editor or `supabase db push`). It runs in one transaction: it either applies completely or not at all.
2. **Deploy the edge function** in `functions/notify-schedule` (it now reads `period_start` instead of `week_offset`).
3. **Merge the app code** so Vercel deploys it.

What it does to existing data:

- `week_offset` ("weeks from today") is converted to real dates: Monday of the row's `created_at` (Lisbon time) + `week_offset` weeks. The old column is kept for history.
- Every shift gets a real `date`. Row counts don't change.
- Old free-text `constraints` are copied into the new `rules` table where the person can be matched by name.
- The `day_settings` unique key that blocked every organization except the first from saving opening hours is removed.

Tested locally (PGlite) against a copy of the production schema: counts unchanged, dates correct, and RLS checks for `save_schedule`, `ensure_week_schedule`, time off and pay privacy.
