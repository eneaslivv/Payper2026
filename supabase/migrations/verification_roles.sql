-- Verificación Final: Roles
-- 1. Clientes 'client' (Debe ser 0)
SELECT count(*) as invalid_roles_remaining FROM profiles WHERE role = 'client';

-- 2. Clientes 'customer' (Debe haber aumentado, antes eran 17 + 3 = 20 aprox)
SELECT count(*) as valid_customers FROM profiles WHERE role = 'customer';
