# AI Phone Voice Provisioning

The product invariant is: **the phone owns the identity; the provider is an adapter.**

## Provisioning flow

1. A compatible Android device exists in AI Phone and is enrolled.
2. The Provisioner selects an owned Telnyx number.
3. `POST /api/devices/:id/voice/provision` creates a dedicated Telnyx Credential Connection for that handset.
4. The selected phone number is assigned to that connection.
5. The SIP password is AES-256-GCM encrypted before it is stored in Postgres.
6. The handset authenticates with its runtime credential and fetches `/api/runtime/voice/config?deviceId=...`.
7. The handset immediately encrypts the SIP password under Android Keystore.
8. `TelnyxHandsetVoice` connects with the assigned number as the handset identity.

The dashboard never receives or displays SIP credentials.

## Server configuration

Required environment variables:

- `TELNYX_API_KEY` — Telnyx V2 API key. Server only.
- `TELNYX_OUTBOUND_VOICE_PROFILE_ID` — outbound voice profile used by per-device Credential Connections.
- `AI_PHONE_VOICE_ENCRYPTION_KEY` — exactly 32 random bytes encoded as base64. Used only to encrypt carrier secrets at rest.

Existing call-control variables from the voice adapter remain separate from the handset SIP/WebRTC identity.

Generate the encryption key with a cryptographically secure 32-byte random source. Never commit the value.

## Database

Migration `0002_device_voice_identity.sql` creates `device_voice_identities` and changes new device voice-provider defaults to `telnyx`.

The table stores provider IDs, phone number, SIP username, and encrypted SIP secret. It never stores plaintext SIP passwords.

## Current acceptance target

A provisioned handset should be able to:

1. enroll with the AI Phone control plane;
2. fetch its own voice identity;
3. store the voice secret behind Android Keystore;
4. register the Telnyx WebRTC client;
5. receive live INVITE events while the runtime is active;
6. originate calls using the assigned AI Phone number.

## Still required for walk-out-the-door ringing

Background incoming-call delivery requires FCM push credentials and Android call/notification integration. That is the next slice. We should use Telnyx's push path rather than keeping a permanent background socket alive just to wait for calls.

Emergency calling stays outside the ordinary autonomous action path. E911 provisioning and 933 verification must become an explicit provisioning/certification stage before AI Phone is called production-ready.
