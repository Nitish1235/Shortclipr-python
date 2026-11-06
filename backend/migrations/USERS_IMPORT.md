# Existing ShortClipr user import

Keep the old Supabase project untouched. Export only the existing `users` columns listed in `PLATFORM_HANDOFF.md`, then import that CSV into a temporary `legacy_users_import` table in the new project.

Required identity fields are `id`, normalized `email`, and `google_sub`. Preserve UUIDs so external references and support records continue to identify the same account. `password_hash` may be retained for historical compatibility, but Google OAuth remains the active sign-in path.

Before importing, verify:

1. The old export row count matches the expected 3,500+ users.
2. `lower(email)` is unique and non-empty.
3. Non-null `google_sub` values are unique.
4. UUIDs are valid and unique.
5. The old database and export remain backed up.

Run `0001_shortclipr_foundation.sql`, create/load the staging table, and then execute `users_import_template.sql`. Compare the source count, imported count, and a sample of Google sign-ins before enabling production traffic. Do not delete the staging table or old Supabase project until that validation is complete.
