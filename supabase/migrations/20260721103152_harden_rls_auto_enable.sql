-- Supabase's RLS event trigger runs as its owner and does not need to be
-- executable through PostgREST by anonymous or authenticated clients.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
