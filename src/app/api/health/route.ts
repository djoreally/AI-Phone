import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch (error) {
    const err = error as NodeJS.ErrnoException & {
      code?: string;
      severity?: string;
      routine?: string;
    };

    console.error("database health check failed", {
      name: err?.name,
      code: err?.code,
      message: err?.message,
      severity: err?.severity,
      routine: err?.routine,
      databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
    });

    return Response.json({ ok: false }, { status: 500 });
  }
}
