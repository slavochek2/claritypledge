-- P1510: sign-in is by emailed link only — a password can never produce a session.
-- client-safe: the revokes are on a trigger function no client calls (PostgREST never exposes trigger-returning functions) and on a clear function only service_role may run; link sign-in, the only product sign-in, never reads encrypted_password.
-- new function
--
-- No product path signs up or signs in with a password, but the auth server
-- still accepts them. This makes every stored password unusable at the source:
-- whatever path writes auth.users.encrypted_password (signup API, admin
-- create/update, password change, recovery then set-password), the row lands
-- with the value the auth server itself stores for passwordless users ('').
-- Emailed-link sign-in never reads that column, so it is unaffected.
--
-- ENVIRONMENTS — one vault secret, `password_signin`, set out of band:
--   'allowed'    TEST. Passwords kept (its suites sign in with them).
--   'forbidden'  prod. Passwords stripped, AND the one-time clear below runs.
--   absent       any other database (local, a fresh branch). Passwords
--                stripped going forward; nothing existing is cleared.
-- So the per-row trigger fails closed (unknown = strip), while the
-- irreversible bulk clear runs only on a positive prod signal. A database
-- that merely lacks its marker never loses data it already had.
--   TEST: select vault.create_secret('allowed',   'password_signin', 'P1510');
--   prod: select vault.create_secret('forbidden', 'password_signin', 'P1510');
--
-- TEST FIXTURES. With 'allowed', an address whose local part ends in '+pwoff'
-- is still stripped, so the mechanism can be exercised on TEST without turning
-- it on for the TEST suites (e2e/integration/*_p1510_*.spec.ts).
--
-- MUST NOT RAISE (trigger). It runs inside the auth server's own INSERT/UPDATE
-- of auth.users; an error would abort account creation or link confirmation.
-- The only fallible step (the vault read) is wrapped, and its failure resolves
-- to "strip". (Known limit: a statement cancel/timeout is not catchable by
-- WHEN OTHERS; it would abort the auth server's statement with or without
-- this trigger.)

create or replace function public.p1510_strip_password()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text;
begin
  begin
    select decrypted_secret into v_mode
      from vault.decrypted_secrets where name = 'password_signin';
  exception when others then
    v_mode := null;
  end;

  if v_mode is distinct from 'allowed'
     or coalesce(new.email, '') ilike '%+pwoff@%' then
    new.encrypted_password := '';
  end if;
  return new;
end;
$$;

revoke all on function public.p1510_strip_password() from public, anon, authenticated;

drop trigger if exists p1510_strip_password on auth.users;
create trigger p1510_strip_password
  before insert or update of encrypted_password on auth.users
  for each row execute function public.p1510_strip_password();

-- The clear: blank stored hashes and revoke the sessions of cleared accounts
-- that have ever signed in (one of those sessions may have come from the
-- password). Accounts sign in again by link. Issued access tokens stay valid
-- until they expire (JWT TTL); sessions and refresh tokens end now.
--   p_user_ids NULL  = every account. Only where the marker is 'forbidden'.
--   p_user_ids given = those accounts only (the TEST proof uses this).
-- Unlike the trigger, this RAISES on an unreadable marker: an irreversible
-- write must never guess which database it is in.
create or replace function public.p1510_clear_passwords(p_user_ids uuid[] default null)
returns table (cleared bigint, revoked bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text;
begin
  select decrypted_secret into v_mode
    from vault.decrypted_secrets where name = 'password_signin';

  if p_user_ids is null and v_mode is distinct from 'forbidden' then
    raise exception 'p1510_clear_passwords: clearing every account needs password_signin=forbidden here (found %)',
      coalesce(v_mode, 'no marker');
  end if;

  return query
  with c as (
    update auth.users u
       set encrypted_password = ''
     where coalesce(u.encrypted_password, '') <> ''
       and (p_user_ids is null or u.id = any (p_user_ids))
    returning u.id, u.last_sign_in_at
  ), r as (
    delete from auth.sessions s
     using c
     where s.user_id = c.id and c.last_sign_in_at is not null
    returning s.id
  )
  select (select count(*) from c), (select count(*) from r);
end;
$$;

revoke all on function public.p1510_clear_passwords(uuid[]) from public, anon, authenticated;
grant execute on function public.p1510_clear_passwords(uuid[]) to service_role;

-- One-time clear, in the same transaction as the trigger, so no window exists
-- in which a stored password still works — on prod only ('forbidden').
do $$
declare
  v_mode text;
  v_cleared bigint;
  v_revoked bigint;
begin
  select decrypted_secret into v_mode
    from vault.decrypted_secrets where name = 'password_signin';

  if v_mode is distinct from 'forbidden' then
    raise notice 'p1510: password_signin=% here: trigger installed, nothing cleared',
      coalesce(v_mode, '(absent)');
    return;
  end if;

  select cleared, revoked into v_cleared, v_revoked from public.p1510_clear_passwords(null);
  raise notice 'p1510: cleared % password hashes, revoked % sessions', v_cleared, v_revoked;
end $$;
