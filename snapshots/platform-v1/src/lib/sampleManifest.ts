// Pure data: shared by the Publisher studio (client) and the seed (server).
export const SAMPLE_MANIFEST = {
  $schema: "https://aiphone.dev/schemas/v3/mcp-capability.json",
  mcpVersion: "2026-07-28",
  capabilityId: "com.example.workorders.capability",
  name: "Work Order Desk",
  version: "1.0.0",
  description: "Exposes vehicle work orders, diagnostic dispatch, and estimate drafting to the AI Phone Runtime.",
  category: "Field service",
  publisher: {
    organization: "Example Fleet Services LLC",
    developerId: "dev_example_01",
    verified: false,
    publicKeyFingerprint: "SHA256:0000000000000000000000000000000000000000000000000000000000000000",
    cimdUri: "https://workorders.example.com/.well-known/mcp-client-metadata.json",
  },
  runtimeRequirements: { minAndroidApi: 33, requiresNetwork: true, requiresBackgroundExecution: false },
  permissions: [
    { name: "android.permission.INTERNET", reason: "Required to query work order cloud APIs over mTLS." },
    { name: "aiphone.permission.CAMERA_READ", reason: "Required to capture inspection photos for work order attachments." },
  ],
  tools: [
    {
      name: "get_work_order",
      description: "Fetch detailed information regarding an assigned vehicle work order.",
      riskLevel: "level_1_read",
      confirmationRequired: false,
      inputSchema: {
        type: "object",
        properties: { workOrderId: { type: "string", pattern: "^WO-[0-9]{4,8}$" } },
        required: ["workOrderId"],
        additionalProperties: false,
      },
    },
    {
      name: "draft_estimate",
      description: "Prepares an itemized repair estimate for customer review.",
      riskLevel: "level_2_prepare",
      confirmationRequired: false,
      inputSchema: {
        type: "object",
        properties: {
          workOrderId: { type: "string", pattern: "^WO-[0-9]{4,8}$" },
          lineItems: {
            type: "array",
            items: {
              type: "object",
              properties: { description: { type: "string", maxLength: 200 }, amount: { type: "number", minimum: 0 } },
              required: ["description", "amount"],
            },
          },
        },
        required: ["workOrderId", "lineItems"],
      },
    },
    {
      name: "dispatch_technician",
      description: "Assigns and dispatches a mobile technician to the job location.",
      riskLevel: "level_3_act",
      confirmationRequired: true,
      requiredEvidence: ["user_location_snapshot", "dispatch_timestamp"],
      inputSchema: {
        type: "object",
        properties: { workOrderId: { type: "string", pattern: "^WO-[0-9]{4,8}$" }, technicianId: { type: "string", maxLength: 40 } },
        required: ["workOrderId", "technicianId"],
        additionalProperties: false,
      },
    },
  ],
  oauthScopes: ["workorders.read", "estimates.write"],
  networkDestinations: ["api.workorders.example.com"],
  dataAccess: ["Work order details", "Customer name and address", "Inspection photos"],
  dataRetention: "Nothing retained by the capability beyond 30 days.",
  mcpApps: [{ templateId: "work_order_card", entryPoint: "ui_templates/main.html", sandboxPermissions: ["allow-scripts"] }],
};
