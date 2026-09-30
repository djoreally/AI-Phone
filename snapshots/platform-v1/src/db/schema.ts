import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { Diagnostics } from "@/lib/shared";

export type ToolDef = {
  name: string;
  description: string;
  level: 1 | 2 | 3 | 4;
  confirmation: "none" | "required" | "step_up";
  requiredEvidence?: string[];
  inputSchema?: Record<string, unknown>;
};

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const devices = pgTable(
  "devices",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    manufacturer: text("manufacturer").notNull().default("Google"),
    model: text("model").notNull(),
    androidVersion: integer("android_version").notNull(),
    ramGb: integer("ram_gb").notNull(),
    securityPatch: text("security_patch").notNull(),
    ownership: text("ownership").notNull().default("personal"), // personal | managed
    voiceProvider: text("voice_provider").notNull().default("telnyx"), // telnyx | twilio | sip | none
    phoneNumber: text("phone_number").notNull().default(""),
    battery: integer("battery").notNull().default(100),
    provisioningStep: integer("provisioning_step").notNull().default(0),
    approvals: jsonb("approvals").$type<string[]>().notNull().default([]),
    lifecycle: text("lifecycle").notNull().default("active"), // active | lost | revoked
    notes: text("notes").notNull().default(""),
    serial: text("serial").notNull().default(""),
    keyFingerprint: text("key_fingerprint").notNull().default(""),
    diagnostics: jsonb("diagnostics").$type<Diagnostics | null>(),
    sipStatus: text("sip_status").notNull().default("unregistered"), // unregistered | registered
    approvedNumbers: jsonb("approved_numbers").$type<string[]>().notNull().default([]),
    rebootedAt: timestamp("rebooted_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("devices_user_idx").on(t.userId)],
);

export const capabilities = pgTable("capabilities", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  publisher: text("publisher").notNull(),
  version: text("version").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  executor: text("executor").notNull(), // android | voice | api | mcp | playwright
  level: integer("level").notNull(),
  verified: boolean("verified").notNull().default(true),
  signed: boolean("signed").notNull().default(true),
  builtin: boolean("builtin").notNull().default(false),
  tools: jsonb("tools").$type<ToolDef[]>().notNull(),
  canDo: jsonb("can_do").$type<string[]>().notNull(),
  cannotDo: jsonb("cannot_do").$type<string[]>().notNull(),
  dataAccess: jsonb("data_access").$type<string[]>().notNull(),
  permissions: jsonb("permissions").$type<string[]>().notNull(),
  oauthScopes: jsonb("oauth_scopes").$type<string[]>().notNull(),
  networkDestinations: jsonb("network_destinations").$type<string[]>().notNull(),
  retention: text("retention").notNull(),
  manifest: jsonb("manifest").$type<Record<string, unknown> | null>(),
  signature: text("signature").notNull().default(""),
  publisherKey: text("publisher_key").notNull().default(""),
  publisherFingerprint: text("publisher_fingerprint").notNull().default(""),
  verification: text("verification").notNull().default("curated"), // curated | signed
  mcpVersion: text("mcp_version").notNull().default("2026-07-28"),
  ownerUserId: integer("owner_user_id").references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const installations = pgTable(
  "installations",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    capabilityId: integer("capability_id")
      .notNull()
      .references(() => capabilities.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("needs_auth"), // connected | needs_auth
    lastHealthCheckAt: timestamp("last_health_check_at", { withTimezone: true }),
    installedAt: timestamp("installed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("installations_user_cap_idx").on(t.userId, t.capabilityId)],
);

export const policies = pgTable(
  "policies",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    matchType: text("match_type").notNull(), // level | capability | tool
    matchValue: text("match_value").notNull(), // "3" | slug | slug:tool
    decision: text("decision").notNull(), // allow | confirm | deny
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("policies_user_idx").on(t.userId)],
);

export const plans = pgTable(
  "plans",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceId: integer("device_id").references(() => devices.id, { onDelete: "set null" }),
    utterance: text("utterance").notNull(),
    summary: text("summary").notNull(),
    status: text("status").notNull().default("proposed"), // proposed | completed | partial | cancelled
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("plans_user_idx").on(t.userId)],
);

export const planSteps = pgTable(
  "plan_steps",
  {
    id: serial("id").primaryKey(),
    planId: integer("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    executor: text("executor").notNull(),
    capabilitySlug: text("capability_slug").notNull(),
    tool: text("tool").notNull(),
    level: integer("level").notNull(),
    decision: text("decision").notNull(), // allow | confirm | deny
    stepUp: boolean("step_up").notNull().default(false),
    reason: text("reason").notNull().default(""),
    status: text("status").notNull().default("pending"), // pending | done | blocked
    result: text("result").notNull().default(""),
    target: text("target").notNull().default(""),
  },
  (t) => [index("plan_steps_plan_idx").on(t.planId)],
);

export const receipts = pgTable(
  "receipts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planId: integer("plan_id").references(() => plans.id, { onDelete: "set null" }),
    deviceId: integer("device_id").references(() => devices.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    executor: text("executor").notNull(),
    capabilitySlug: text("capability_slug").notNull().default(""),
    tool: text("tool").notNull().default(""),
    level: integer("level").notNull().default(1),
    decision: text("decision").notNull().default("allow"),
    outcome: text("outcome").notNull(), // success | blocked | cancelled | failed
    detail: text("detail").notNull().default(""),
    evidence: jsonb("evidence").$type<string[]>().notNull().default([]),
    uid: text("uid").notNull().default(""),
    deviceRef: text("device_ref").notNull().default(""),
    planRef: text("plan_ref").notNull().default(""),
    capabilityVersion: text("capability_version").notNull().default(""),
    userQuery: text("user_query").notNull().default(""),
    target: text("target").notNull().default(""),
    authMethod: text("auth_method").notNull().default("auto_policy"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    durationMs: integer("duration_ms").notNull().default(0),
    providerSessionId: text("provider_session_id").notNull().default(""),
    signature: text("signature").notNull().default(""),
    invocation: jsonb("invocation").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("receipts_user_idx").on(t.userId, t.createdAt)],
);

export const callTokens = pgTable(
  "call_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceId: integer("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    jti: text("jti").notNull().unique(),
    direction: text("direction").notNull(), // outbound | listen
    numbers: jsonb("numbers").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("issued"), // issued | used | revoked
    issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [index("call_tokens_device_idx").on(t.deviceId)],
);
