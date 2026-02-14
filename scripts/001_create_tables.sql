-- 2MStream Database Schema
-- Tables: profiles, videos, destinations, streams, stream_destinations, scheduled_events, settings

-- 1. Profiles (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- 2. Videos
create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  duration text,
  size_bytes bigint default 0,
  format text,
  resolution text,
  status text not null default 'uploading' check (status in ('uploading', 'processing', 'ready', 'error')),
  storage_path text,
  thumbnail_path text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.videos enable row level security;
create policy "videos_select_own" on public.videos for select using (auth.uid() = user_id);
create policy "videos_insert_own" on public.videos for insert with check (auth.uid() = user_id);
create policy "videos_update_own" on public.videos for update using (auth.uid() = user_id);
create policy "videos_delete_own" on public.videos for delete using (auth.uid() = user_id);

-- 3. Destinations
create table if not exists public.destinations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'twitch', 'facebook', 'custom')),
  name text not null,
  stream_key text not null,
  server_url text not null,
  enabled boolean default true,
  connected boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.destinations enable row level security;
create policy "destinations_select_own" on public.destinations for select using (auth.uid() = user_id);
create policy "destinations_insert_own" on public.destinations for insert with check (auth.uid() = user_id);
create policy "destinations_update_own" on public.destinations for update using (auth.uid() = user_id);
create policy "destinations_delete_own" on public.destinations for delete using (auth.uid() = user_id);

-- 4. Streams
create table if not exists public.streams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  video_id uuid not null references public.videos(id) on delete cascade,
  status text not null default 'idle' check (status in ('idle', 'scheduled', 'live', 'completed', 'error')),
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  viewers integer default 0,
  bitrate integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.streams enable row level security;
create policy "streams_select_own" on public.streams for select using (auth.uid() = user_id);
create policy "streams_insert_own" on public.streams for insert with check (auth.uid() = user_id);
create policy "streams_update_own" on public.streams for update using (auth.uid() = user_id);
create policy "streams_delete_own" on public.streams for delete using (auth.uid() = user_id);

-- 5. Stream-Destination junction
create table if not exists public.stream_destinations (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.streams(id) on delete cascade,
  destination_id uuid not null references public.destinations(id) on delete cascade,
  health numeric default 100.0,
  created_at timestamptz default now(),
  unique(stream_id, destination_id)
);

alter table public.stream_destinations enable row level security;
create policy "stream_dest_select" on public.stream_destinations for select
  using (exists (select 1 from public.streams where streams.id = stream_destinations.stream_id and streams.user_id = auth.uid()));
create policy "stream_dest_insert" on public.stream_destinations for insert
  with check (exists (select 1 from public.streams where streams.id = stream_destinations.stream_id and streams.user_id = auth.uid()));
create policy "stream_dest_delete" on public.stream_destinations for delete
  using (exists (select 1 from public.streams where streams.id = stream_destinations.stream_id and streams.user_id = auth.uid()));

-- 6. Scheduled Events
create table if not exists public.scheduled_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  video_id uuid not null references public.videos(id) on delete cascade,
  scheduled_date date not null,
  scheduled_time time not null,
  repeat_mode text default 'none' check (repeat_mode in ('none', 'daily', 'weekly', 'monthly')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.scheduled_events enable row level security;
create policy "events_select_own" on public.scheduled_events for select using (auth.uid() = user_id);
create policy "events_insert_own" on public.scheduled_events for insert with check (auth.uid() = user_id);
create policy "events_update_own" on public.scheduled_events for update using (auth.uid() = user_id);
create policy "events_delete_own" on public.scheduled_events for delete using (auth.uid() = user_id);

-- 7. Event-Destination junction
create table if not exists public.event_destinations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.scheduled_events(id) on delete cascade,
  destination_id uuid not null references public.destinations(id) on delete cascade,
  created_at timestamptz default now(),
  unique(event_id, destination_id)
);

alter table public.event_destinations enable row level security;
create policy "event_dest_select" on public.event_destinations for select
  using (exists (select 1 from public.scheduled_events where scheduled_events.id = event_destinations.event_id and scheduled_events.user_id = auth.uid()));
create policy "event_dest_insert" on public.event_destinations for insert
  with check (exists (select 1 from public.scheduled_events where scheduled_events.id = event_destinations.event_id and scheduled_events.user_id = auth.uid()));
create policy "event_dest_delete" on public.event_destinations for delete
  using (exists (select 1 from public.scheduled_events where scheduled_events.id = event_destinations.event_id and scheduled_events.user_id = auth.uid()));

-- 8. User Settings
create table if not exists public.user_settings (
  id uuid primary key references auth.users(id) on delete cascade,
  default_resolution text default '1080',
  default_bitrate integer default 6000,
  default_framerate integer default 30,
  default_audio_bitrate integer default 128,
  notify_stream_started boolean default true,
  notify_stream_ended boolean default true,
  notify_stream_errors boolean default true,
  notify_upload_complete boolean default false,
  webhook_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.user_settings enable row level security;
create policy "settings_select_own" on public.user_settings for select using (auth.uid() = id);
create policy "settings_insert_own" on public.user_settings for insert with check (auth.uid() = id);
create policy "settings_update_own" on public.user_settings for update using (auth.uid() = id);
