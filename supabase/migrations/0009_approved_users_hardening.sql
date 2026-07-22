-- 0009_approved_users_hardening.sql
-- Hardening da migration 0008, conforme apontado pelo security advisor do Supabase:
--   * normalize_approved_user_email não tinha search_path fixo (function_search_path_mutable).
--   * is_approved_user() e link_approved_user() estavam expostas via RPC a `anon`
--     (anon_security_definer_function_executable / authenticated_security_definer_function_executable).
--     link_approved_user só deve rodar pelo trigger em auth.users; is_approved_user só
--     precisa ser chamável por usuários autenticados (é o que o AuthGate usa).

alter function public.normalize_approved_user_email() set search_path = public;

revoke all on function public.link_approved_user() from public, anon, authenticated;

revoke all on function public.is_approved_user() from public, anon;
grant execute on function public.is_approved_user() to authenticated;
