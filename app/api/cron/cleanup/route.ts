import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await query<{ count: string }>(
    `DELETE FROM sessions WHERE expires_at < now() RETURNING id`
  );

  return NextResponse.json({ deleted: result.length });
}
