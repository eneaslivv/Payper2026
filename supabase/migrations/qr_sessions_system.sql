-- ============================================
-- QR SESSIONS SYSTEM - Complete Migration
-- Phases 1-3: Schema + Audit + Sessions + RPC
-- ============================================

-- ============================================
-- FASE 1: QR CODES TABLE
-- ============================================

-- ENUM for QR types
DO $$ BEGIN
  CREATE TYPE qr_type AS ENUM ('table', 'bar', 'pickup', 'generic');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Main QR codes table (replaces qr_links)
CREATE TABLE IF NOT EXISTS qr_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  qr_type qr_type NOT NULL,
  code_hash text NOT NULL UNIQUE,
  
  -- Context by type
  table_id uuid REFERENCES venue_nodes(id) ON DELETE SET NULL,
  bar_id uuid REFERENCES venue_nodes(id) ON DELETE SET NULL,
  location_id uuid REFERENCES storage_locations(id) ON DELETE SET NULL,
  
  -- Metadata
  label text NOT NULL,
  is_active boolean DEFAULT true,
  scan_count integer DEFAULT 0,
  last_scanned_at timestamptz,
  
  -- Regeneration tracking
  regenerated_from uuid REFERENCES qr_codes(id),
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Constraints for type validation
DO $$ BEGIN
  ALTER TABLE qr_codes ADD CONSTRAINT qr_table_requires_table_id 
    CHECK (qr_type != 'table' OR table_id IS NOT NULL);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE qr_codes ADD CONSTRAINT qr_bar_requires_bar_id 
    CHECK (qr_type != 'bar' OR bar_id IS NOT NULL);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_qr_codes_store ON qr_codes(store_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_hash ON qr_codes(code_hash);
CREATE INDEX IF NOT EXISTS idx_qr_codes_table ON qr_codes(table_id) WHERE table_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qr_codes_active ON qr_codes(store_id, is_active) WHERE is_active = true;

-- ============================================
-- FASE 2: QR SCAN LOGS (Audit)
-- ============================================

-- ENUM for scan sources
DO $$ BEGIN
  CREATE TYPE scan_source AS ENUM ('camera', 'link', 'manual');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Scan logs table
CREATE TABLE IF NOT EXISTS qr_scan_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_id uuid NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  session_id uuid, -- FK added after client_sessions created
  
  scanned_at timestamptz DEFAULT now(),
  source scan_source DEFAULT 'camera',
  client_ip inet,
  user_agent text,
  
  -- Normalized context (always same structure)
  resolved_context jsonb NOT NULL DEFAULT '{}',
  -- Structure: {"type":"table|bar|pickup|generic","table_id":null,"bar_id":null,"location_id":null,"label":"..."}
  
  created_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_qr_scan_logs_qr ON qr_scan_logs(qr_id);
CREATE INDEX IF NOT EXISTS idx_qr_scan_logs_store ON qr_scan_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_qr_scan_logs_scanned ON qr_scan_logs(scanned_at DESC);

-- ============================================
-- FASE 3: CLIENT SESSIONS
-- ============================================

-- ENUM for session types  
DO $$ BEGIN
  CREATE TYPE session_type AS ENUM ('table', 'bar', 'pickup', 'generic');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Client sessions table (operational context, NOT auth)
CREATE TABLE IF NOT EXISTS client_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  
  -- Origin
  qr_id uuid REFERENCES qr_codes(id) ON DELETE SET NULL,
  session_type session_type NOT NULL,
  
  -- Resolved context
  table_id uuid REFERENCES venue_nodes(id) ON DELETE SET NULL,
  bar_id uuid REFERENCES venue_nodes(id) ON DELETE SET NULL,
  location_id uuid REFERENCES storage_locations(id) ON DELETE SET NULL,
  
  -- Timing
  started_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_activity_at timestamptz DEFAULT now(),
  
  -- State
  is_active boolean DEFAULT true,
  ended_at timestamptz,
  end_reason text, -- 'expired', 'manual', 'new_session', 'logout'
  
  created_at timestamptz DEFAULT now()
);

-- Indexes for sessions
CREATE INDEX IF NOT EXISTS idx_client_sessions_active ON client_sessions(store_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_client_sessions_client ON client_sessions(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_sessions_expires ON client_sessions(expires_at) WHERE is_active = true;

-- Add FK from qr_scan_logs to client_sessions
DO $$ BEGIN
  ALTER TABLE qr_scan_logs ADD CONSTRAINT fk_scan_session 
    FOREIGN KEY (session_id) REFERENCES client_sessions(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- FASE 3.5: ORDERS INTEGRATION
-- ============================================

-- Add session_id to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES client_sessions(id) ON DELETE SET NULL;

-- ============================================
-- RPC: create_client_session
-- TTL configurable by store via menu_logic.qr_session_ttl_minutes
-- ============================================

CREATE OR REPLACE FUNCTION create_client_session(
  p_store_id uuid,
  p_qr_id uuid DEFAULT NULL,
  p_session_type session_type DEFAULT 'generic',
  p_table_id uuid DEFAULT NULL,
  p_bar_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_ttl_minutes integer DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_session_id uuid;
  v_ttl_minutes integer;
  v_expires_at timestamptz;
BEGIN
  -- Get TTL: priority = param > store config > default (90)
  SELECT COALESCE(
    p_ttl_minutes,
    (s.menu_logic->>'qr_session_ttl_minutes')::integer,
    90
  )
  INTO v_ttl_minutes
  FROM stores s
  WHERE s.id = p_store_id;
  
  -- If store not found, use default
  IF v_ttl_minutes IS NULL THEN
    v_ttl_minutes := 90;
  END IF;
  
  v_expires_at := now() + (v_ttl_minutes || ' minutes')::interval;
  
  -- Invalidate previous active sessions for same client in this store
  IF p_client_id IS NOT NULL THEN
    UPDATE client_sessions 
    SET is_active = false, ended_at = now(), end_reason = 'new_session'
    WHERE store_id = p_store_id 
      AND client_id = p_client_id 
      AND is_active = true;
  END IF;
  
  -- Create new session
  INSERT INTO client_sessions (
    store_id, client_id, qr_id, session_type,
    table_id, bar_id, location_id,
    expires_at
  ) VALUES (
    p_store_id, p_client_id, p_qr_id, p_session_type,
    p_table_id, p_bar_id, p_location_id,
    v_expires_at
  ) RETURNING id INTO v_session_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'expires_at', v_expires_at,
    'ttl_minutes', v_ttl_minutes
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- RPC: log_qr_scan
-- Creates scan log and optionally session
-- ============================================

CREATE OR REPLACE FUNCTION log_qr_scan(
  p_qr_id uuid,
  p_source scan_source DEFAULT 'camera',
  p_client_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_create_session boolean DEFAULT true
) RETURNS jsonb AS $$
DECLARE
  v_qr qr_codes%ROWTYPE;
  v_session_id uuid;
  v_session_result jsonb;
  v_resolved_context jsonb;
  v_scan_id uuid;
BEGIN
  -- Get QR data
  SELECT * INTO v_qr FROM qr_codes WHERE id = p_qr_id AND is_active = true;
  
  IF v_qr IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'QR not found or inactive');
  END IF;
  
  -- Build normalized resolved_context
  v_resolved_context := jsonb_build_object(
    'type', v_qr.qr_type::text,
    'table_id', v_qr.table_id,
    'bar_id', v_qr.bar_id,
    'location_id', v_qr.location_id,
    'label', v_qr.label
  );
  
  -- Create session if requested
  IF p_create_session THEN
    v_session_result := create_client_session(
      p_store_id := v_qr.store_id,
      p_qr_id := p_qr_id,
      p_session_type := v_qr.qr_type::text::session_type,
      p_table_id := v_qr.table_id,
      p_bar_id := v_qr.bar_id,
      p_location_id := v_qr.location_id,
      p_client_id := p_client_id
    );
    v_session_id := (v_session_result->>'session_id')::uuid;
  END IF;
  
  -- Create scan log
  INSERT INTO qr_scan_logs (
    qr_id, store_id, session_id, source,
    client_ip, user_agent, resolved_context
  ) VALUES (
    p_qr_id, v_qr.store_id, v_session_id, p_source,
    p_client_ip::inet, p_user_agent, v_resolved_context
  ) RETURNING id INTO v_scan_id;
  
  -- Update QR scan count
  UPDATE qr_codes 
  SET scan_count = scan_count + 1, last_scanned_at = now()
  WHERE id = p_qr_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'scan_id', v_scan_id,
    'session_id', v_session_id,
    'session', v_session_result,
    'context', v_resolved_context,
    'store_id', v_qr.store_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- RPC: get_active_session
-- Returns active session for client in store
-- ============================================

CREATE OR REPLACE FUNCTION get_active_session(
  p_session_id uuid
) RETURNS jsonb AS $$
DECLARE
  v_session client_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session 
  FROM client_sessions 
  WHERE id = p_session_id;
  
  IF v_session IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session not found');
  END IF;
  
  -- Check if expired
  IF v_session.expires_at < now() THEN
    -- Mark as expired
    UPDATE client_sessions 
    SET is_active = false, ended_at = now(), end_reason = 'expired'
    WHERE id = p_session_id;
    
    RETURN jsonb_build_object('success', false, 'error', 'Session expired', 'expired', true);
  END IF;
  
  IF NOT v_session.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session inactive');
  END IF;
  
  -- Update last activity
  UPDATE client_sessions 
  SET last_activity_at = now()
  WHERE id = p_session_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'session', jsonb_build_object(
      'id', v_session.id,
      'store_id', v_session.store_id,
      'session_type', v_session.session_type,
      'table_id', v_session.table_id,
      'bar_id', v_session.bar_id,
      'location_id', v_session.location_id,
      'qr_id', v_session.qr_id,
      'expires_at', v_session.expires_at,
      'started_at', v_session.started_at
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- RPC: end_session
-- Manually end a session
-- ============================================

CREATE OR REPLACE FUNCTION end_session(
  p_session_id uuid,
  p_reason text DEFAULT 'manual'
) RETURNS jsonb AS $$
BEGIN
  UPDATE client_sessions 
  SET is_active = false, ended_at = now(), end_reason = p_reason
  WHERE id = p_session_id AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session not found or already ended');
  END IF;
  
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- RLS POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_scan_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_sessions ENABLE ROW LEVEL SECURITY;

-- QR Codes: Read for all authenticated, write for store staff
CREATE POLICY "qr_codes_read_all" ON qr_codes FOR SELECT USING (true);
CREATE POLICY "qr_codes_write_staff" ON qr_codes FOR ALL USING (
  store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid())
);

-- Scan Logs: Insert for all, read for store staff
CREATE POLICY "qr_scan_logs_insert" ON qr_scan_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "qr_scan_logs_read_staff" ON qr_scan_logs FOR SELECT USING (
  store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid())
);

-- Client Sessions: Read own, full for store staff
CREATE POLICY "client_sessions_read_own" ON client_sessions FOR SELECT USING (
  client_id = auth.uid() OR
  store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid())
);
CREATE POLICY "client_sessions_insert" ON client_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "client_sessions_update" ON client_sessions FOR UPDATE USING (
  client_id = auth.uid() OR
  store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid())
);

-- ============================================
-- DATA MIGRATION: qr_links → qr_codes
-- ============================================

INSERT INTO qr_codes (id, store_id, qr_type, code_hash, table_id, label, is_active, created_at)
SELECT 
  ql.id,
  ql.store_id,
  CASE 
    WHEN ql.target_type = 'table' THEN 'table'::qr_type
    WHEN ql.target_type = 'bar' THEN 'bar'::qr_type
    ELSE 'generic'::qr_type
  END,
  ql.code_hash,
  ql.target_node_id,
  COALESCE(
    vn.label,
    'QR-' || LEFT(ql.code_hash, 6)
  ),
  ql.is_active,
  ql.created_at
FROM qr_links ql
LEFT JOIN venue_nodes vn ON vn.id = ql.target_node_id
WHERE ql.code_hash IS NOT NULL
ON CONFLICT (code_hash) DO NOTHING;

-- ============================================
-- DONE
-- ============================================
