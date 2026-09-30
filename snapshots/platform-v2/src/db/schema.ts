import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  organization: varchar("organization", { length: 160 }).default("Personal workspace").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: varchar("id", { length: 128 }).primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CompatibilityCheck = {
  label: string;
  status: "supported" | "limited" | "awaiting" | "unsupported";
  note?: string;
};

export const devices = pgTable("devices", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  manufacturer: varchar("manufacturer", { length: 80 }).notNull(),
  model: varchar("model", { length: 120 }).notNull(),
  androidVersion: integer("android_version").notNull(),
  ramGb: integer("ram_gb").notNull(),
  securityPatch: varchar("security_patch", { length: 20 }).notNull(),
  playCertified: boolean("play_certified").default(true).notNull(),
  enrollmentMode: varchar("enrollment_mode", { length: 30 }).default("personal").notNull(), // personal | managed
  voiceProvider: varchar("voice_provider", { length: 30 }).default("twilio").notNull(), // twilio | telnyx | sip | sim
  assignedNumber: varchar("assigned_number", { length: 40 }),
  status: varchar("status", { length: 30 }).default("pending").notNull(), // pending | ready | needs_approval | blocked | revoked
  compatibility: jsonb("compatibility").$type<CompatibilityCheck[]>().default([]).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CapabilityTool = {
  name: string;
  risk: "read" | "prepare" | "consequential" | "restricted";
  confirmation: "none" | "required" | "step_up";
  evidence: string[];
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export type ManifestVerification = {
  schemaValid: boolean;
  publisherSignature: "valid" | "invalid" | "unsigned";
  cimdResolved: boolean;
  mcpVersion: string;
  fingerprint: string | null;
  checkedAt: string;
  issues: string[];
};

export const capabilities = pgTable("capabilities", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  slug: varchar("slug", { length: 160 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  publisher: varchar("publisher", { length: 120 }).notNull(),
  version: varchar("version", { length: 20 }).default("1.0.0").notNull(),
  category: varchar("category", { length: 60 }).default("Productivity").notNull(),
  executor: varchar("executor", { length: 40 }).default("mcp").notNull(), // android | api | mcp | playwright | voice
  level: integer("level").default(1).notNull(), // 1 read, 2 prepare, 3 act w/ confirmation, 4 restricted
  description: text("description").default("").notNull(),
  can: jsonb("can").$type<string[]>().default([]).notNull(),
  cannot: jsonb("cannot").$type<string[]>().default([]).notNull(),
  dataAccess: jsonb("data_access").$type<string[]>().default([]).notNull(),
  tools: jsonb("tools").$type<CapabilityTool[]>().default([]).notNull(),
  permissions: jsonb("permissions").$type<string[]>().default([]).notNull(),
  networkDestinations: jsonb("network_destinations").$type<string[]>().default([]).notNull(),
  verified: boolean("verified").default(false).notNull(),
  status: varchar("status", { length: 30 }).default("available").notNull(), // available | installed | revoked
  healthy: boolean("healthy").default(true).notNull(),
  manifest: jsonb("manifest").$type<Record<string, unknown> | null>().default(null),
  manifestVerification: jsonb("manifest_verification").$type<ManifestVerification | null>().default(null),
  cimdUri: varchar("cimd_uri", { length: 300 }),
  endpoint: varchar("endpoint", { length: 300 }),
  installedAt: timestamp("installed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const policies = pgTable("policies", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 140 }).notNull(),
  description: text("description").default("").notNull(),
  scope: varchar("scope", { length: 60 }).default("*").notNull(), // capability slug, executor name, or *
  actionPattern: varchar("action_pattern", { length: 140 }).default("*").notNull(),
  minLevel: integer("min_level").default(1).notNull(),
  decision: varchar("decision", { length: 20 }).default("confirm").notNull(), // allow | confirm | deny | step_up
  priority: integer("priority").default(100).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PlanStep = {
  id: string;
  title: string;
  executor: "android" | "api" | "mcp" | "playwright" | "voice";
  capability: string;
  level: number;
  decision: "allow" | "confirm" | "deny" | "step_up";
  status: "pending" | "done" | "denied" | "skipped";
};

export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  deviceId: integer("device_id").references(() => devices.id, { onDelete: "set null" }),
  request: text("request").notNull(),
  understanding: text("understanding").default("").notNull(),
  steps: jsonb("steps").$type<PlanStep[]>().default([]).notNull(),
  status: varchar("status", { length: 30 }).default("proposed").notNull(), // proposed | confirmed | running | completed | cancelled | failed
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const receipts = pgTable("receipts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  planId: integer("plan_id").references(() => plans.id, { onDelete: "set null" }),
  deviceId: integer("device_id").references(() => devices.id, { onDelete: "set null" }),
  action: varchar("action", { length: 200 }).notNull(),
  capability: varchar("capability", { length: 120 }).notNull(),
  executor: varchar("executor", { length: 40 }).notNull(),
  level: integer("level").default(1).notNull(),
  decision: varchar("decision", { length: 20 }).notNull(), // allowed | confirmed | denied | step_up
  outcome: varchar("outcome", { length: 20 }).default("success").notNull(), // success | failed | blocked
  summary: text("summary").default("").notNull(),
  evidence: jsonb("evidence").$type<string[]>().default([]).notNull(),
  durationMs: integer("duration_ms").default(0).notNull(),
  receiptRef: varchar("receipt_ref", { length: 60 }),
  authMethod: varchar("auth_method", { length: 40 }).default("auto_policy").notNull(), // auto_policy | ui_confirmation_card | biometric_step_up | policy_denied
  signature: text("signature"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ProvisionStep = {
  key: string;
  title: string;
  detail: string;
  status: "pending" | "running" | "passed" | "warning" | "failed";
  log: string[];
};

export const provisioningRuns = pgTable("provisioning_runs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  deviceId: integer("device_id")
    .notNull()
    .references(() => devices.id, { onDelete: "cascade" }),
  transport: varchar("transport", { length: 20 }).default("usb_adb").notNull(), // usb_adb | qr_enrollment
  steps: jsonb("steps").$type<ProvisionStep[]>().default([]).notNull(),
  currentStep: integer("current_step").default(0).notNull(),
  status: varchar("status", { length: 20 }).default("running").notNull(), // running | certified | failed
  certificate: text("certificate"),
  keyFingerprint: varchar("key_fingerprint", { length: 80 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const voiceTokens = pgTable("voice_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  deviceId: integer("device_id")
    .notNull()
    .references(() => devices.id, { onDelete: "cascade" }),
  jti: varchar("jti", { length: 64 }).notNull(),
  provider: varchar("provider", { length: 20 }).notNull(),
  scope: varchar("scope", { length: 40 }).notNull(), // outbound | inbound_listener
  allowedNumber: varchar("allowed_number", { length: 40 }),
  token: text("token").notNull(),
  revoked: boolean("revoked").default(false).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ProvisioningRun = typeof provisioningRuns.$inferSelect;
export type VoiceToken = typeof voiceTokens.$inferSelect;
export type User = typeof users.$inferSelect;
export type Device = typeof devices.$inferSelect;
export type Capability = typeof capabilities.$inferSelect;
export type Policy = typeof policies.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Receipt = typeof receipts.$inferSelect;
