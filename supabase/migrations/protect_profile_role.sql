-- SECURITY: Prevent users from self-promoting (changing their own role)
-- Only Service Role or Triggers (Security Definer) should modify 'role'

CREATE OR REPLACE FUNCTION public.check_profile_role_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Allow if executed by service_role (superuser) or if role is not changing
    IF (auth.role() = 'service_role') OR (OLD.role IS NOT DISTINCT FROM NEW.role) THEN
        RETURN NEW;
    END IF;

    -- Block any other attempt to change role
    RAISE EXCEPTION 'Security Violation: You cannot change your own role.';
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_role_change ON profiles;

CREATE TRIGGER protect_profile_role_change
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE PROCEDURE public.check_profile_role_update();
