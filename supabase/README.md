# Supabase setup

RevTaw uses Supabase for PostgreSQL, authentication and private file storage.
Every table is protected with row-level security so a student can only ever
reach their own data.

## 1. Create a project

1. Create a project at https://supabase.com/dashboard.
2. Open **Project Settings → API** and copy:
   - the **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - the **publishable** key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - a **secret** key → `SUPABASE_SECRET_KEY` (server only, optional; needed
     for account deletion)
3. Put them in `.env.local` (see `.env.example`). `.env*` files are ignored by
   git on purpose.

## 2. Apply the migrations

Run each file in `supabase/migrations/` **in order** in the SQL editor
(**SQL Editor → New query → paste → Run**), or with the CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

| Migration | What it adds |
| --- | --- |
| `0001_profiles.sql` | `profiles` table (display name, onboarding preferences), enums, `updated_at` trigger, automatic profile creation on sign-up, RLS policies |
| `0002_materials.sql` | `subjects`, `folders`, `materials`, `material_chunks`, `material_analyses` with owner-only RLS and composite ownership keys; private `materials` storage bucket (25 MB, allow-listed MIME types) with per-user folder policies |

Migrations are additive. Never edit an applied migration; add a new numbered
file instead.

## 3. Configure authentication

**Authentication → URL Configuration**

- Site URL: your deployment origin (e.g. `http://localhost:3000` locally).
- Redirect URLs: add `http://localhost:3000/auth/callback` and the same path on
  your production domain.

**Authentication → Providers → Email**

- Keep **Confirm email** enabled: RevTaw requires email verification before a
  student can sign in.

**Authentication → Email Templates** (recommended)

The default templates work with the `/auth/callback` route. For links that also
work when the email is opened in a different browser or device than the one
that started the flow, point the templates at the token-hash route instead:

- Confirm signup:
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup`
- Reset password:
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`
- Change email address:
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/settings/account`

## 4. Rate limits

Supabase applies its own limits to sign-up, sign-in and email sending. RevTaw
adds a small per-IP limiter in front of the auth actions as an extra layer.
