-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- Creates the trips table and a private photo bucket. Each signed-in user
-- can only see and change their own trips and photos.

create table if not exists public.trips (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trip_date date,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trips_user_date on public.trips (user_id, trip_date desc);

alter table public.trips enable row level security;

drop policy if exists "own trips select" on public.trips;
drop policy if exists "own trips insert" on public.trips;
drop policy if exists "own trips update" on public.trips;
drop policy if exists "own trips delete" on public.trips;
create policy "own trips select" on public.trips for select to authenticated using (user_id = auth.uid());
create policy "own trips insert" on public.trips for insert to authenticated with check (user_id = auth.uid());
create policy "own trips update" on public.trips for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own trips delete" on public.trips for delete to authenticated using (user_id = auth.uid());

-- Private bucket for catch photos, stored as <user id>/<trip id>/<photo>.jpg
insert into storage.buckets (id, name, public)
values ('catch-photos', 'catch-photos', false)
on conflict (id) do nothing;

drop policy if exists "own photos select" on storage.objects;
drop policy if exists "own photos insert" on storage.objects;
drop policy if exists "own photos update" on storage.objects;
drop policy if exists "own photos delete" on storage.objects;
create policy "own photos select" on storage.objects for select to authenticated
  using (bucket_id = 'catch-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'catch-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos update" on storage.objects for update to authenticated
  using (bucket_id = 'catch-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'catch-photos' and (storage.foldername(name))[1] = auth.uid()::text);
