-- Add store_id to payment_webhooks for better filtering/security
ALTER TABLE public.payment_webhooks 
ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id);

-- Ensure payload_json and headers_json are correctly named (if not already)
-- This is just for safety, the introspection showed they exist.
