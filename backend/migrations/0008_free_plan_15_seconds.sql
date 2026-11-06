-- Preserve any already-reserved or spent time while moving existing free
-- accounts from the previous 20-second allowance to one 15-second short.
UPDATE credit_accounts AS account
SET total_credits = GREATEST(15, account.spent_credits + account.reserved_credits)
FROM users
WHERE users.id = account.user_id
  AND users.plan = 'free'
  AND account.total_credits > 15;
