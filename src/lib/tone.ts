export type Tone = "neutral" | "lime" | "sky" | "amber" | "rose" | "violet";

export function levelTone(level: number): Tone {
  return (["lime", "sky", "amber", "rose"] as const)[Math.min(4, Math.max(1, level)) - 1];
}

export function decisionTone(decision: string): Tone {
  if (decision === "allow" || decision === "allowed") return "lime";
  if (decision === "confirm" || decision === "confirmed") return "amber";
  if (decision === "step_up") return "violet";
  if (decision === "blocked" || decision === "deny" || decision === "denied") return "rose";
  return "neutral";
}
