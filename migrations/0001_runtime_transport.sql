ALTER TABLE devices ADD COLUMN IF NOT EXISTS runtime_token_hash varchar(64);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS public_key_pem text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS key_fingerprint varchar(95);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS enrolled_at timestamptz;

CREATE TABLE IF NOT EXISTS runtime_commands (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id integer NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  capability varchar(120) NOT NULL,
  tool varchar(120) NOT NULL,
  level integer NOT NULL DEFAULT 3,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(20) NOT NULL DEFAULT 'queued',
  delivered_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS runtime_commands_device_status_idx
  ON runtime_commands(device_id, status, created_at);
