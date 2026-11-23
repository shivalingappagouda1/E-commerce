# ShopKart Admin Email OTP — staging implementation starter

Target project: `ulmwssozdmppvydppswx` (ShopKart-Staging). Do not use the `ecommerce-platform` project.

Included:
- `supabase/migrations/202611180001_admin_email_otp.sql`
- `supabase/functions/admin-auth-otp/index.ts`
- `src/pages/customer/AdminOtpPage.jsx`

Policy:
- OTP: 8 digits, 5-minute expiry, max 5 attempts, 60-second resend cooldown.
- The database's `public.is_admin()` now checks the OTP verification for the exact Supabase JWT `session_id`.
- OTP hashes are stored; raw codes are sent only through Brevo.
- The SQL and function are NOT deployed. Review before use.

Required Edge Function secrets (never place these in frontend files or share them in chat):
- `BREVO_API_KEY`
- `BREVO_SENDER_EMAIL` (intended sender: `shipkart3150@gmail.com`, must be verified in Brevo)
- `OTP_HASH_SECRET` (generate a unique random secret with at least 32 bytes)
- `APP_ORIGIN` (exact staging frontend origin)
Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.

## Important: not yet ready to activate
The frontend integration is deliberately not represented as complete yet. Your current `AuthContext.jsx`, `LoginPage.jsx`, `AuthGuard.jsx`, and `AppRoutes.jsx` still need coordinated full-file replacements to:
1. distinguish admin role from OTP-verified admin state;
2. call Edge Function `start` after password login for admin accounts;
3. call `status` on bootstrap and after OTP verification;
4. route admins to `/admin/verify`;
5. require `adminOtpVerified` in `AuthGuard`;
6. handle Google OAuth admin callback safely (otherwise OAuth admins could bypass the OTP screen in the UI);
7. keep customer login behaviour unchanged.

Do not deploy the function or apply SQL until that integration is completed and tested. Also confirm the `session_id` claim exists in this project's access token before applying the migration.

Once all files have been reviewed and you explicitly approve rollout, use the linked staging project only. Do not paste secrets into chat.
