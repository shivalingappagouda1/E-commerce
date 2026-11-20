-- Run in ShopKart-Staging SQL Editor AFTER enabling pg_cron, pg_net, and Vault,
-- and after storing ACCOUNT_PURGE_CRON_SECRET in Vault as account_purge_cron_secret.
select cron.schedule(
  'shopkart-account-deletion-purge',
  '*/15 * * * *',
  $$
    select net.http_post(
      url := 'https://ulmwssozdmppvydppswx.supabase.co/functions/v1/account-lifecycle',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'account_purge_cron_secret' limit 1)
      ),
      body := '{"action":"purge_expired"}'::jsonb
    );
  $$
);
