# AI Phone Background Incoming Calls

AI Phone does not keep a permanent socket alive just to wait for a call. Incoming calls use the provider's Android push path so a provisioned phone can ring while the runtime is backgrounded or the process has been killed.

## Flow

1. Each handset has its own Telnyx Credential Connection and assigned phone number.
2. The connection is linked to the AI Phone Android push credential.
3. During voice setup the enrolled handset fetches public Firebase runtime configuration from the control plane.
4. Firebase is initialized locally and the handset obtains an FCM token.
5. `TelnyxHandsetVoice` registers that FCM token during Telnyx credential login.
6. An incoming PSTN call causes Telnyx to send a high-priority FCM push.
7. `AiPhoneFirebaseMessagingService` starts `IncomingCallService`.
8. The service immediately becomes a `phoneCall` foreground service and displays a high-importance call notification with a full-screen call surface.
9. Opening the call surface passes Telnyx push metadata into the voice runtime.
10. The handset reconnects to Telnyx with that push metadata, receives the real INVITE, and exposes Answer / Reject.
11. Missed-call or answered-elsewhere pushes stop the foreground ringing surface.

## Required server configuration

Voice provisioning now requires:

- `TELNYX_ANDROID_PUSH_CREDENTIAL_ID`
- `AI_PHONE_FIREBASE_APPLICATION_ID`
- `AI_PHONE_FIREBASE_PROJECT_ID`
- `AI_PHONE_FIREBASE_API_KEY`
- `AI_PHONE_FIREBASE_SENDER_ID`

These are in addition to the voice-provisioning variables in `VOICE_PROVISIONING.md`.

The Firebase Android options above identify the Firebase project and are delivered only to an authenticated enrolled runtime. Telnyx API keys, SIP passwords, Firebase service-account material, and other privileged secrets remain server-side or device-keystore protected.

## Android behavior

The runtime declares notification, microphone, foreground-service, phone-call foreground-service, own-call, and full-screen-call capabilities. `MainActivity` is `singleTop`, may display while locked, and may turn the screen on for a call.

The runtime does not claim Android's system dialer role yet. Native `ConnectionService` / `PhoneAccount` integration is a separate hardening step if AI Phone is to fully participate in Android Telecom, Bluetooth call controls, automotive surfaces, and system call history.

## Acceptance still required on hardware

This source has not yet been certified on a physical handset. Before calling background ringing production-ready, verify on a reference Android device that:

- Firebase initializes after provisioning and survives process restart;
- the FCM token reaches Telnyx registration;
- an incoming PSTN call produces an FCM data push;
- the phone rings while the runtime is backgrounded;
- the phone rings after the process is killed;
- the lock-screen call surface opens;
- Answer establishes two-way audio;
- Reject ends the call;
- answered-elsewhere and missed-call events clear the ringing surface;
- Bluetooth, speaker, earpiece, and microphone routing behave correctly;
- Android 14+ foreground-service and full-screen-intent restrictions are satisfied.
