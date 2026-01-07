-- Fix RLS Policy: Allow clients to update their own orders
-- The existing UPDATE policy only allows staff (profiles) to update orders
-- This adds permission for clients to update their own orders (needed for wallet payments)

-- Add policy for clients to update their own orders
CREATE POLICY "Clients can update their own orders"
ON orders FOR UPDATE
USING (client_id = auth.uid());

-- Note: Also need to ensure clients can view their own orders (may already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'orders' 
    AND policyname = 'Clients can view their own orders'
  ) THEN
    CREATE POLICY "Clients can view their own orders"
    ON orders FOR SELECT
    USING (client_id = auth.uid());
  END IF;
END $$;
