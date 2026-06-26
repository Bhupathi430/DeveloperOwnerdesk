-- SQL Schema for Nexure Studios Supabase Migration

-- 1. Enable pgcrypto extension for password hashing
create extension if not exists pgcrypto;

-- 2. Create employees table (stores both employees and admins)
create table public.employees (
  id uuid references auth.users on delete cascade primary key,
  employee_id text unique not null,
  name text not null,
  email text not null,
  phone text,
  role text not null check (role in ('admin', 'employee')),
  role_title text,
  password text, -- Cleartext reference for owner
  is_suspended boolean default false,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Create projects table
create table public.projects (
  id text primary key,
  name text not null,
  description text,
  assigned_to uuid references public.employees(id) on delete set null,
  deadline date not null,
  status text not null check (status in ('Pending', 'In Progress', 'Completed')) default 'Pending',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Create attendance table
create table public.attendance (
  id text primary key,
  employee_id uuid references public.employees(id) on delete cascade not null,
  name text not null,
  date date not null,
  clock_in timestamp with time zone not null,
  clock_out timestamp with time zone,
  duration text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Create active_sessions table (for live chronograph shifts)
create table public.active_sessions (
  employee_id uuid references public.employees(id) on delete cascade primary key,
  clock_in_time timestamp with time zone not null
);

-- 6. Create payments table
create table public.payments (
  id text primary key,
  customer_name text not null,
  description text not null,
  amount numeric not null,
  upi_string text not null,
  timestamp timestamp with time zone not null,
  status text not null check (status in ('Pending', 'Success')) default 'Pending'
);

-- 7. Enable Row Level Security (RLS)
alter table public.employees enable row level security;
alter table public.projects enable row level security;
alter table public.attendance enable row level security;
alter table public.active_sessions enable row level security;
alter table public.payments enable row level security;

-- 8. Row Level Security Policies

-- Employees Table Policies
create policy "Admins can do everything on employees" on public.employees
  for all using (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');

create policy "Employees can read their own profile" on public.employees
  for select using (auth.uid() = id);

create policy "Employees can update their own profile" on public.employees
  for update using (auth.uid() = id);

-- Projects Table Policies
create policy "Admins can do everything on projects" on public.projects
  for all using (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');

create policy "Employees can read assigned projects" on public.projects
  for select using (auth.uid() = assigned_to);

create policy "Employees can update assigned projects status" on public.projects
  for update using (auth.uid() = assigned_to);

-- Attendance Table Policies
create policy "Admins can do everything on attendance" on public.attendance
  for all using (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');

create policy "Employees can read their own attendance" on public.attendance
  for select using (auth.uid() = employee_id);

create policy "Employees can insert their own attendance" on public.attendance
  for insert with check (auth.uid() = employee_id);

-- Active Sessions Table Policies
create policy "Admins can do everything on active_sessions" on public.active_sessions
  for all using (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');

create policy "Employees can manage their own active session" on public.active_sessions
  for all using (auth.uid() = employee_id);

-- Payments Table Policies
create policy "Admins can do everything on payments" on public.payments
  for all using (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin');

create policy "Anyone can insert payments" on public.payments
  for insert with check (true);

create policy "Anyone can read payments" on public.payments
  for select using (true);

-- 9. Storage Buckets and Policies for Avatars
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing;

create policy "Allow public read of avatars" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "Allow users to upload their own avatar" on storage.objects
  for insert with check (
    bucket_id = 'avatars' 
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Allow users to update their own avatar" on storage.objects
  for update using (
    bucket_id = 'avatars' 
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 10. Enable Realtime Replication
begin;
  -- If publication exists, add tables to it.
  -- Supabase typically has a default publication named 'supabase_realtime'.
  alter publication supabase_realtime add table public.employees;
  alter publication supabase_realtime add table public.projects;
  alter publication supabase_realtime add table public.attendance;
  alter publication supabase_realtime add table public.active_sessions;
  alter publication supabase_realtime add table public.payments;
commit;

-- 11. Seed Initial Master Owner User
-- Creating the user in auth.users with email 'owner@nexure.com' and password '9696'
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  'd3b07384-d113-4956-a5db-82b6b81d77a5', -- Fixed UUID for Master Owner
  'authenticated',
  'authenticated',
  'owner@nexure.com',
  crypt('9696', gen_salt('bf', 10)),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Master Owner","role":"admin"}',
  now(),
  now(),
  '',
  '',
  '',
  ''
) on conflict (id) do nothing;

-- Inserting Master Owner profile into public.employees
insert into public.employees (
  id,
  employee_id,
  name,
  email,
  role,
  password,
  is_suspended,
  avatar_url
) values (
  'd3b07384-d113-4956-a5db-82b6b81d77a5',
  '9696',
  'Master Owner',
  'owner@nexure.com',
  'admin',
  '9696',
  false,
  'https://api.dicebear.com/7.x/identicon/svg?seed=Master%20Owner'
) on conflict (id) do nothing;
