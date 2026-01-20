-- Create CASH SESSIONS table
CREATE TABLE IF NOT EXISTS cash_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    zone_id UUID NOT NULL REFERENCES venue_zones(id) ON DELETE CASCADE,
    opened_by UUID NOT NULL REFERENCES profiles(id),
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    closed_by UUID REFERENCES profiles(id),
    start_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('open', 'closed')) DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create CASH CLOSURES table
CREATE TABLE IF NOT EXISTS cash_closures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
    expected_cash DECIMAL(12,2) NOT NULL DEFAULT 0,
    real_cash DECIMAL(12,2) NOT NULL DEFAULT 0,
    difference DECIMAL(12,2) GENERATED ALWAYS AS (real_cash - expected_cash) STORED,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_closures ENABLE ROW LEVEL SECURITY;

-- Policies for cash_sessions
-- Policies for cash_sessions
DROP POLICY IF EXISTS "Enable read for store members" ON cash_sessions;
CREATE POLICY "Enable read for store members" ON cash_sessions
    FOR SELECT USING (store_id IN (
        SELECT store_id FROM profiles WHERE id = auth.uid()
    ));

DROP POLICY IF EXISTS "Enable insert for store members" ON cash_sessions;
CREATE POLICY "Enable insert for store members" ON cash_sessions
    FOR INSERT WITH CHECK (store_id IN (
        SELECT store_id FROM profiles WHERE id = auth.uid()
    ));

DROP POLICY IF EXISTS "Enable update for store members" ON cash_sessions;
CREATE POLICY "Enable update for store members" ON cash_sessions
    FOR UPDATE USING (store_id IN (
        SELECT store_id FROM profiles WHERE id = auth.uid()
    ));

-- Policies for cash_closures
DROP POLICY IF EXISTS "Enable read for store members" ON cash_closures;
CREATE POLICY "Enable read for store members" ON cash_closures
    FOR SELECT USING (store_id IN (
        SELECT store_id FROM profiles WHERE id = auth.uid()
    ));

DROP POLICY IF EXISTS "Enable insert for store members" ON cash_closures;
CREATE POLICY "Enable insert for store members" ON cash_closures
    FOR INSERT WITH CHECK (store_id IN (
        SELECT store_id FROM profiles WHERE id = auth.uid()
    ));
