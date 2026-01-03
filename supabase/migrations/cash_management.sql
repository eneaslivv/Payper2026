-- Enable UUID extension if not exists
create extension if not exists "uuid-ossp";

-- 1. ZONES Table
create table if not exists zones (
  id uuid default uuid_generate_v4() primary key,
  store_id uuid references stores(id) on delete cascade not null,
  name text not null,
  type text not null check (type in ('bar', 'salon', 'takeaway', 'pickup')),
  is_active boolean default true,
  created_at timestamptz default now()
);

-- 2. CASH SESSIONS (Turnos / Cajas)
create table if not exists cash_sessions (
  id uuid default uuid_generate_v4() primary key,
  store_id uuid references stores(id) on delete cascade not null,
  zone_id uuid references zones(id) not null,
  opened_by uuid references profiles(id) not null,
  closed_by uuid references profiles(id),
  opened_at timestamptz default now(),
  closed_at timestamptz,
  status text default 'open' check (status in ('open', 'closed')),
  start_amount numeric default 0
);

-- 3. CASH CLOSURES (Arqueo)
create table if not exists cash_closures (
  id uuid default uuid_generate_v4() primary key,
  store_id uuid references stores(id) on delete cascade not null,
  session_id uuid references cash_sessions(id) not null unique,
  expected_cash numeric not null default 0,
  expected_digital numeric not null default 0, -- For context
  real_cash numeric not null default 0,
  difference numeric generated always as (real_cash - expected_cash) stored,
  notes text,
  closed_at timestamptz default now()
);

-- 4. DISPATCH SESSIONS (Despachos)
create table if not exists dispatch_sessions (
  id uuid default uuid_generate_v4() primary key,
  store_id uuid references stores(id) on delete cascade not null,
  zone_id uuid references zones(id) not null,
  opened_at timestamptz default now(),
  closed_at timestamptz,
  status text default 'open' check (status in ('open', 'closed')),
  total_orders_processed integer default 0
);

-- 5. DAY CLOSURES (Cierre de Día)
create table if not exists day_closures (
  id uuid default uuid_generate_v4() primary key,
  store_id uuid references stores(id) on delete cascade not null,
  date date not null default current_date,
  total_revenue numeric not null default 0,
  total_orders integer not null default 0,
  zones_summary jsonb, -- Snapshot of zones performance
  closed_by uuid references profiles(id),
  closed_at timestamptz default now(),
  created_at timestamptz default now(),
  unique(store_id, date)
);

-- RLS POLICIES
alter table zones enable row level security;
alter table cash_sessions enable row level security;
alter table cash_closures enable row level security;
alter table dispatch_sessions enable row level security;
alter table day_closures enable row level security;

-- Simple policies (Store isolation)
create policy "Enable all for store users" on zones for all using (store_id in (select store_id from profiles where id = auth.uid()));
create policy "Enable all for store users" on cash_sessions for all using (store_id in (select store_id from profiles where id = auth.uid()));
create policy "Enable all for store users" on cash_closures for all using (store_id in (select store_id from profiles where id = auth.uid()));
create policy "Enable all for store users" on dispatch_sessions for all using (store_id in (select store_id from profiles where id = auth.uid()));
create policy "Enable all for store users" on day_closures for all using (store_id in (select store_id from profiles where id = auth.uid()));

-- SEED DEFAULT ZONES (Optional function to init store)
create or replace function init_store_zones(target_store_id uuid)
returns void as $$
begin
  insert into zones (store_id, name, type) values
  (target_store_id, 'Barra Principal', 'bar'),
  (target_store_id, 'Salón Interior', 'salon'),
  (target_store_id, 'Delivery Point', 'pickup')
  on conflict do nothing;
end;
$$ language plpgsql;
