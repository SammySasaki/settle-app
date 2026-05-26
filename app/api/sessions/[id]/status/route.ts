import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { emit } from "@/lib/events";
import type { SessionStatus } from "@/lib/types";

const VALID: SessionStatus[] = ["lobby", "collecting", "ranking", "done"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { status } = await req.json();
  if (!VALID.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  await query(`UPDATE sessions SET status = $1 WHERE id = $2`, [status, id]);
  emit(id, { type: "status_changed", status });
  return new NextResponse(null, { status: 204 });
}
