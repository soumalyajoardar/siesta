-- SIESTA Supabase schema — paste this whole file into your Supabase project's
-- SQL Editor (https://supabase.com/dashboard → your project → SQL → New query)
-- and press Run. Safe to re-run: every statement is IF NOT EXISTS / upsert.
--
-- What it creates:
--   1. collections table — one row per store collection
--      (products, coupons, orders, events, settings), data as JSONB.
--      The backend reads/writes plain objects, exactly like the JSON files.
--   2. product-images storage bucket (public read, writes via service key only).
--   3. Row Level Security: public can READ products/events/settings only.
--      Orders and coupons are readable ONLY with the service_role key,
--      which lives on your server and is never sent to browsers.

-- ---------- 1. collections table ----------
create table if not exists public.collections (
  name text primary key,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.collections enable row level security;

-- Public read for storefront content; everything else needs service_role.
drop policy if exists "public read products" on public.collections;
create policy "public read products" on public.collections
  for select using (name in ('products', 'events', 'settings'));

-- NOTE: there is deliberately NO public read policy for 'orders'/'coupons'.
-- The backend uses the service_role key, which bypasses RLS.

-- ---------- 2. product-images bucket ----------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- Public read of product photos.
drop policy if exists "public read product images" on storage.objects;
create policy "public read product images" on storage.objects
  for select using (bucket_id = 'product-images');

-- Writes/deletes happen with the service_role key (bypasses RLS),
-- so browsers can never upload or delete directly.

-- ---------- 3. sanity check (should return 1 row) ----------
-- select count(*) from public.collections;
