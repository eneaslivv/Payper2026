-- ============================================
-- EMAIL LOGS SYSTEM - Phase 1
-- Transactional email tracking and auditing
-- Already applied to Supabase on 2026-01-03
-- ============================================

-- 1. Create email_logs table with refined schema
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Aislamiento Multi-Tenant (CRÍTICO)
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  
  -- Destinatario
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  recipient_type TEXT CHECK (recipient_type IN ('client', 'staff', 'owner', 'system')),
  
  -- Evento que disparó el email (flexible, no UUID)
  event_type TEXT NOT NULL,
  event_id TEXT,
  event_entity TEXT,
  
  -- Template (separado de Resend IDs)
  template_key TEXT NOT NULL,
  template_provider_id TEXT,
  template_version INT DEFAULT 1,
  
  -- Estado del envío
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'queued_confirming', 'processing', 'sent',
    'failed', 'bounced', 'cancelled', 'opened', 'clicked'
  )),
  
  -- Resend tracking
  resend_id TEXT,
  resend_response JSONB,
  
  -- Payload (core data, limited size ~50KB)
  payload_core JSONB NOT NULL,
  
  -- Error handling
  error_message TEXT,
  error_code TEXT,
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  
  -- Idempotencia (CRÍTICO)
  idempotency_key TEXT UNIQUE NOT NULL,
  
  -- Trazabilidad
  triggered_by TEXT DEFAULT 'webhook' CHECK (triggered_by IN ('webhook', 'cron', 'manual', 'api', 'system')),
  trigger_source TEXT,
  correlation_id TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  queued_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_email_logs_store ON email_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_event ON email_logs(event_type, event_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_idempotency ON email_logs(idempotency_key);

-- Enable RLS
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Store members can view their email logs" ON email_logs
  FOR SELECT USING (store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Service role can manage email logs" ON email_logs
  FOR ALL USING (true) WITH CHECK (true);
