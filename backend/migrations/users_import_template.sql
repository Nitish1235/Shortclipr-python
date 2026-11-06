-- Run manually after loading the old users export into legacy_users_import.
-- This file is deliberately excluded from automatic deployment migrations.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM legacy_users_import WHERE email IS NULL OR btrim(email) = '') THEN
    RAISE EXCEPTION 'Import stopped: blank email';
  END IF;
  IF EXISTS (SELECT 1 FROM legacy_users_import GROUP BY lower(btrim(email)) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Import stopped: duplicate normalized email';
  END IF;
  IF EXISTS (SELECT 1 FROM legacy_users_import WHERE google_sub IS NOT NULL GROUP BY google_sub HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Import stopped: duplicate google_sub';
  END IF;
END $$;

INSERT INTO users(id,email,full_name,avatar_url,google_sub,password_hash,plan,subscription_status,dodo_subscription_id,plan_expires_at,dodo_event_at,created_at,updated_at)
SELECT id,lower(btrim(email)),COALESCE(full_name,''),avatar_url,google_sub,password_hash,COALESCE(plan,'free'),COALESCE(subscription_status,'inactive'),dodo_subscription_id,plan_expires_at,dodo_event_at,COALESCE(created_at,now()),COALESCE(updated_at,now())
FROM legacy_users_import
ON CONFLICT (email) DO UPDATE SET
  full_name=EXCLUDED.full_name,
  avatar_url=COALESCE(EXCLUDED.avatar_url,users.avatar_url),
  google_sub=COALESCE(users.google_sub,EXCLUDED.google_sub),
  password_hash=COALESCE(users.password_hash,EXCLUDED.password_hash),
  updated_at=greatest(users.updated_at,EXCLUDED.updated_at);

INSERT INTO credit_accounts(user_id,total_credits)
SELECT id,0 FROM users
ON CONFLICT (user_id) DO NOTHING;

COMMIT;
