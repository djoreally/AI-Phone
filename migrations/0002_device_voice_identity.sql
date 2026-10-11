CREATE TABLE IF NOT EXISTS device_voice_identities (
  id serial PRIMARY KEY,
  device_id integer NOT NULL UNIQUE REFERENCES devices(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider varchar(30) NOT NULL DEFAULT 'telnyx',
  provider_connection_id varchar(120) NOT NULL,
  provider_phone_number_id varchar(120) NOT NULL,
  phone_number varchar(40) NOT NULL,
  sip_username varchar(120) NOT NULL,
  sip_secret_ciphertext text NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'ready',
  provisioned_at timestamptz NOT NULL DEFAULT now(),
  last_config_fetch_at timestamptz
);

CREATE INDEX IF NOT EXISTS device_voice_identities_user_idx
  ON device_voice_identities(user_id);

ALTER TABLE devices ALTER COLUMN voice_provider SET DEFAULT 'telnyx';
UPDATE devices SET voice_provider = 'telnyx' WHERE voice_provider = 'twilio';
