-- HOTFIX: Clean up duplicate client records and prevent future duplicates

-- Step 1: Create a unique constraint on (auth_user_id, store_id) to prevent duplicates
-- First, we need to delete duplicates keeping only the oldest record

-- Delete duplicates keeping the first created record per auth_user_id + store_id
DELETE FROM clients c1
USING clients c2
WHERE c1.auth_user_id = c2.auth_user_id
  AND c1.store_id = c2.store_id
  AND c1.auth_user_id IS NOT NULL
  AND c1.created_at > c2.created_at;

-- Also handle cases where auth_user_id is null - keep oldest per email + store_id  
DELETE FROM clients c1
USING clients c2
WHERE c1.email = c2.email
  AND c1.store_id = c2.store_id
  AND c1.auth_user_id IS NULL
  AND c2.auth_user_id IS NULL
  AND c1.created_at > c2.created_at;

-- Step 2: Add unique constraint to prevent future duplicates
-- Using partial index to handle null auth_user_id cases
DO $$
BEGIN
    -- Try to create unique index on auth_user_id + store_id (for authenticated users)
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'clients_auth_user_store_unique'
    ) THEN
        CREATE UNIQUE INDEX clients_auth_user_store_unique 
        ON clients (auth_user_id, store_id) 
        WHERE auth_user_id IS NOT NULL;
    END IF;
END $$;

-- Step 3: Fix the ClientContext auto-creation to check for existing records first
-- This is done by updating the upsert logic in the frontend
-- For now, we'll ensure the SELECT policy works correctly
