-- Table de test minimale pour valider Supabase depuis l'app RN.
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_at timestamptz not null default now()
);

alter table public.notes enable row level security;

-- Pour un test rapide (sans auth), on autorise lecture/écriture via anon key.
-- À remplacer ensuite par des policies RBAC réelles.
create policy "notes_select_anon"
on public.notes for select
to anon
using (true);

create policy "notes_insert_anon"
on public.notes for insert
to anon
with check (true);

