-- Add default dispatch station assignment for staff users
-- When a user has a default_station_id, they are "locked" to that station
-- for order creation and stock movements.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS default_station_id UUID
REFERENCES public.dispatch_stations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_default_station_id
ON public.profiles(default_station_id);

NOTIFY pgrst, 'reload schema';
