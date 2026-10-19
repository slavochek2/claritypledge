-- P1510: sign-in is by emailed link only — a password can never produce a session.
-- client-safe: the revoke is on a trigger function no client calls (PostgREST never exposes trigger-returning functions); link sign-in, the only product sign-in, never reads encrypted_password.
-- new function
--
-- No product path signs up or signs in with a password, but the auth server
-- still accepts them. This makes every stored password unusable at the source:
-- whatever path writes auth.users.encrypted_password (signup API, admin
-- create/update, password change, recovery then set-password), the row lands
-- with the value the auth server itself stores for passwordless users ('').
-- Emailed-link sign-in never reads that column, so it is unaffected.
--
-- ENVIRONMENTS. This file applies to TEST and prod alike, and TEST must keep
-- passwords (its suites sign in with them). The switch is a per-environment
-- vault secret, set out of band on TEST only:
--     select vault.create_secret('allowed', 'password_signin', 'P1510: TEST keeps password sign-in');
-- Absent, unreadable or any other value = passwords stripped. That is the
-- fail-closed direction: an environment that loses its marker loses password
-- sign-in, never the reverse.
--
-- TEST FIXTURES. With the marker present, an address whose local part ends in
-- '+pwoff' is still stripped, so the mechanism can be exercised on TEST
-- without turning it on for the TEST suites (e2e/p1510-*.spec.ts).
--
-- MUST NOT RAISE. This runs inside the auth server's own INSERT/UPDATE of
-- auth.users; an error here would abort account creation or link
-- confirmation. The only fallible step (the vault read) is wrapped, and its
-- failure resolves to "strip".

create or replace function public.p1510_strip_password()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed boolean := false;
begin
  begin
    select exists (
      select 1 from vault.decrypted_secrets
      where name = 'password_signin' and decrypted_secret = 'allowed'
    ) into v_allowed;
  exception when others then
    v_allowed := false;
  end;

  if not coalesce(v_allowed, false)
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

-- One-time clear, in the same transaction as the trigger, so no window exists
-- in which a stored password still works. Skipped where the marker allows
-- passwords (TEST). Accounts that had a password AND have ever signed in lose
-- their live sessions: one of them may have been signed in by that password.
-- They sign in again by link.
do $$
declare
  v_allowed boolean := false;
  v_cleared integer;
  v_revoked integer;
begin
  begin
    select exists (
      select 1 from vault.decrypted_secrets
      where name = 'password_signin' and decrypted_secret = 'allowed'
    ) into v_allowed;
  exception when others then
    v_allowed := false;
  end;

  if v_allowed then
    raise notice 'p1510: password_signin=allowed here — no hashes cleared';
    return;
  end if;

  with cleared as (
    update auth.users
       set encrypted_password = ''
     where coalesce(encrypted_password, '') <> ''
    returning id, last_sign_in_at
  ), revoked as (
    delete from auth.sessions s
     using cleared c
     where s.user_id = c.id and c.last_sign_in_at is not null
    returning s.id
  )
  select (select count(*) from cleared), (select count(*) from revoked)
    into v_cleared, v_revoked;

  raise notice 'p1510: cleared % password hashes, revoked % sessions', v_cleared, v_revoked;
end $$;
