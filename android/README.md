# AI Phone Android Runtime v0.1

This is the first real handset execution slice for AI Phone.

## What is real in this slice

- Runs as an Android app and can be selected as a HOME launcher.
- Uses the Android `SEND_SMS` permission and telephony stack.
- Applies the AI Phone policy floor locally: `android.sms:send_sms` is Level 3 and must be confirmed.
- Generates a non-exportable EC signing key in Android Keystore.
- Signs and stores a JSON execution receipt after success, failure, block, or cancellation.

## What is intentionally not wired yet

- Cloud/control-plane registration.
- LLM planner / voice input.
- Contacts resolution.
- Receipt upload/verification in the Next.js control plane.
- Device Owner provisioning and assistant-role enrollment.

## Build requirements

- JDK 17
- Android SDK 37
- Gradle 9.6+
- Android Gradle Plugin 9.4.x

Open the `android/` directory in Android Studio, sync, install on a test Android device, grant SMS permission, and send to a test number.

## Acceptance test

1. Launch AI Phone.
2. Enter a real test destination and message.
3. Tap **Policy-check & send SMS**.
4. Confirm the Level 3 action.
5. Verify the SMS arrives.
6. Verify a signed JSON receipt exists under the app's internal `files/receipts/` directory.

That proves the first end-to-end AI Phone invariant: **policy before action; signed evidence after action**.
