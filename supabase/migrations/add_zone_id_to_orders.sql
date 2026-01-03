-- Add zone_id to orders table
alter table orders
add column if not exists zone_id uuid references zones(id);

-- Index for performance
create index if not exists idx_orders_zone_id on orders(zone_id);

-- RLS Policy update (ensure it's readable by store users)
-- (Existing policies on orders usually cover store_id check, which is sufficient)
