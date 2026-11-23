# ShopKart Admin Email OTP — corrected backend

Replace these exact files in your project:

- `supabase/functions/admin-auth-otp/index.ts`
- `supabase/migrations/202611180001_admin_email_otp.sql`

## Edge Function secrets

Set these in the linked Supabase project (ShopKart-Staging, ref `ulmwssozdmppvydppswx`):

- `BREVO_API_KEY` — your Brevo transactional API key
- `BREVO_SENDER_EMAIL` — `shipkart3150@gmail.com` (must be verified in Brevo)
- `OTP_HASH_SECRET` — a unique random secret of at least 32 characters
- `APP_ORIGIN` — exact deployed frontend origin, e.g. `https://your-store-domain.example` (no trailing slash)

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions in the normal hosted environment. Never put the service-role key or Brevo key in frontend code or chat.

## Important

Do not deploy the function or apply the SQL until you have reviewed the migration against the live staging schema and confirmed the project link. This migration changes `public.is_admin()`, which is used by existing RLS policies. It does not automatically protect privileged Edge Functions or SECURITY DEFINER RPCs that do not call `public.is_admin()`; those must be audited separately.

The OTP is bound to the Supabase Auth `session_id` claim. The verified window is 12 hours for that same login session. A new login session requires a new OTP.
