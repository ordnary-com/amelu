-- A suspended customer (abuse) can no longer use the dashboard or the API:
-- session and API key lookups skip them. Set by hand by an operator.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS suspended_reason TEXT;
