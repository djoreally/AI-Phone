import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "Unauthorized");
  return user;
}

export function handle(fn: () => Promise<Response>) {
  return fn().catch((err: unknown) => {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  });
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError(400, "Invalid JSON body");
  }
}

export function idFrom(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Invalid id");
  return id;
}

export function str(v: unknown, fallback = "") {
  return typeof v === "string" ? v.trim() : fallback;
}
export function num(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
export function bool(v: unknown, fallback = false) {
  return typeof v === "boolean" ? v : fallback;
}
export function strList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") return v.split("\n").map((x) => x.trim()).filter(Boolean);
  return [];
}
