# AI Phone Voice

AI Phone owns the interface. Telnyx is the first adapter.

## Stable capability surface

- `phone.call.start`
- `phone.call.answer`
- `phone.call.reject`
- `phone.call.end`

Application logic must depend on these capability names, not Telnyx APIs.

## Execution boundary

Cloud proposes -> enrolled handset authorizes -> voice provider executes -> handset signs a receipt.

The control plane must not bypass handset policy for autonomous calls. Runtime provider actions require the per-device runtime credential and use the number already assigned to that device.

## Telnyx v1

Server configuration:

- `PHONE_VOICE_PROVIDER=telnyx`
- `TELNYX_API_KEY`
- `TELNYX_CALL_CONTROL_CONNECTION_ID`
- `TELNYX_DEFAULT_FROM_NUMBER` (fallback only; enrolled device number wins)

Handset media uses the Telnyx Android WebRTC SDK and SIP/WebRTC credentials provisioned to the enrolled device. Provider secrets must never be committed to the repository.

## Safety invariant

Ordinary `phone.call.start` refuses emergency destinations. Emergency calling will be implemented separately as `phone.emergency.*` with explicit user interaction, emergency-location readiness checks, and its own acceptance tests.

## Still required for a production-ready ringing phone

1. Provision a Telnyx Credential Connection and outbound voice profile.
2. Assign a Telnyx number to the enrolled AI Phone device.
3. Deliver per-device SIP/WebRTC credentials securely during provisioning.
4. Configure FCM and Telnyx push credentials for background incoming calls.
5. Add the Android foreground phone-call service / incoming call surface.
6. Add signed call-state receipts and call-quality evidence.
7. Configure and test E911 separately; never use live 911 for routine testing.
