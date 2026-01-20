-- Enable pg_net for Webhooks
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA extensions;

-- Create Trigger Function
CREATE OR REPLACE FUNCTION trigger_welcome_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/handle-new-client',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
        ),
        body := jsonb_build_object('record', row_to_json(NEW))
    );
    RETURN NEW;
END;
$$;

-- Note: 'app.settings.supabase_url' might not be set in standard Supabase.
-- Using Hardcoded URL or Vault relies on setup.
-- Standard Supabase Webhooks use internal system.
-- If I use `pg_net`, I need the URL.
-- I will use a placeholder or check if I can get URL.
-- Usually we just use the Project URL.
-- Project ID: yjxjyxhksedwfeueduwl.
-- URL: https://yjxjyxhksedwfeueduwl.supabase.co/functions/v1/handle-new-client

CREATE OR REPLACE FUNCTION trigger_welcome_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_url TEXT := 'https://yjxjyxhksedwfeueduwl.supabase.co/functions/v1/handle-new-client';
    v_service_key TEXT := 'SERVICE_KEY_PLACEHOLDER'; -- I should not hardcode secret in migration if possible.
    -- But anon key is fine for triggering? 
    -- handle-new-client uses Anon Key? 
    -- Wait, if I use Anon Key, RLS applies? 
    -- The Function expects 'Authorization: Bearer ANON_KEY'.
    -- I will use logic to GET key? No.
BEGIN
    -- For now I use ANON key if I have it? I don't have it in SQL context easily.
    -- But wait, `vault`?
    
    -- Alternative: Use Supabase Dashboard Webhooks (Human Task).
    -- I will try to create the function but I CANNOT properly secure it in SQL without the key.
    
    -- Actually, I will ask user to setup Webhook in Dashboard?
    -- "He creado la función. Por favor ve a Supabase > Database > Webhooks y crea uno para 'clients' INSERT -> URL ."
    
    -- But user wants AUTOMATION.
    
    -- I'll use `net.http_post` with a Placeholder, and tell user to replace it?
    -- Or I can use `vault.secrets` if valid.
    
    RETURN NEW;
END;
$$;
