-- Fix profile creation to handle invitation roles
-- When a user signs up via invitation, set their role from the invitation

-- Update the handle_new_user function to check for invitation token
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv_token uuid;
  inv_role text;
begin
  -- Check if user signed up with an invitation token
  inv_token := (new.raw_user_meta_data ->> 'invitation_token')::uuid;
  
  if inv_token is not null then
    -- Look up the invitation to get the role
    select role into inv_role
    from public.invitations
    where token = inv_token
      and status = 'pending'
      and email = lower(new.email);
  end if;

  -- Insert profile with role (defaults to 'admin' for first user or 'viewer' otherwise)
  insert into public.profiles (id, display_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(inv_role, 'admin') -- Default to admin for users without invitation (first user)
  )
  on conflict (id) do update set
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    email = coalesce(excluded.email, public.profiles.email),
    role = coalesce(inv_role, public.profiles.role);

  return new;
end;
$$;

-- Also add policy to allow authenticated users to view all profiles (for team management)
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles 
  for select 
  to authenticated 
  using (true);
