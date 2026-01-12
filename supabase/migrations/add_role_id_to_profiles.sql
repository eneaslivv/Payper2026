-- Add role_id to profiles to link with cafe_roles
ALTER TABLE profiles 
ADD COLUMN role_id uuid REFERENCES cafe_roles(id);

-- Optional: Index for performance
CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON profiles(role_id);
