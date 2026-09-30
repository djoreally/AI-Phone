# AI Phone Studio 📱🤖

> **The Phone is Your Robot.**
> Playwright is the browser butler. Android is the body. MCP is the tool catalog. Policy is the conscience. The AI Phone is the robot.

AI Phone Studio is an open-source provisioning platform, on-device AI runtime engine, and policy-brokered capability marketplace. It transforms supported Android smartphones into deterministically gated, action-oriented autonomous agents—without giving raw LLMs unrestricted control over system APIs or permissions.

---

## 🔑 Core Concepts

Traditional mobile AI agent architectures rely on fragile accessibility service scraping or unrestricted permission grants. **AI Phone Studio** replaces this with explicit policy isolation:

1. **Policy Broker (The Conscience):** Every action requested by the AI planner passes through a static and dynamic policy engine. Risk levels (Read, Prepare, Act, Restricted) dictate whether an action executes automatically, requires a UI confirmation card, or demands biometric step-up authentication.
2. **Android Native Runtime (The Body):** Interacts directly with native Android system APIs, telephony stacks, camera hardware, and local intents rather than scraping UI pixels.
3. **Hosted Playwright Workers (The Butler):** Browsing and web tasks run in ephemeral, cloud-isolated Chromium containers. Screenshots, trace logs, and downloads are sandboxed and returned as verifiable audit evidence.
4. **Model Context Protocol (MCP Tool Catalog):** Services register capabilities using typed JSON-RPC contracts over mTLS/HTTP, bound by cryptographically signed manifests.
5. **Deterministic Receipts:** Every executed, blocked, or cancelled action produces an immutable `receipt.json` signed using per-device hardware keys (Android KeyStore / HSM).

---

## 🏗 System Architecture

```text
               AI PHONE STUDIO SYSTEM DATA FLOW

┌────────────────────────┐         USB ADB / MDM Payload
│  AI PHONE STUDIO       │ ──────────────────────────────┐
│  (Desktop / Web Plane) │                               │
└────────────────────────┘                               ▼
                                             ┌───────────────────────┐
┌────────────────────────┐  User Input       │   AI PHONE RUNTIME    │
│  USER INTERFACE        │ ────────────────> │  (Kotlin System App)  │
│  (Custom Launcher App) │ <──────────────── │                       │
└────────────────────────┘  Visual Feedback  └───────────┬───────────┘
                                                         │
                                   Typed Outcome Request │
                                                         ▼
                                             ┌───────────────────────┐
                                             │     POLICY BROKER     │
                                             │  (Deterministic Gate) │
                                             └───────────┬───────────┘
                                                         │
                                 ┌───────────────────────┼───────────────────────┐
                                 ▼                       ▼                       ▼
                       ┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
                       │   Android Native  │   │  Telephony Engine │   │   Remote Cloud    │
                       │    Tool Adapters  │   │ (Twilio / Telnyx) │   │ Playwright Worker │
                       └───────────────────┘   └───────────────────┘   └───────────────────┘
