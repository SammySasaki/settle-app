import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import type { Result } from "@/lib/types";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await queryOne<Result>(`SELECT * FROM results WHERE session_id = $1`, [id]);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(result);
}
