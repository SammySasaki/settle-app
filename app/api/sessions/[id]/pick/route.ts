import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { emit } from "@/lib/events";
import type { Option } from "@/lib/types";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { optionId, participantId } = await req.json() as { optionId: string; participantId: string };

  if (!optionId || !participantId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const option = await queryOne<Option>(`SELECT * FROM options WHERE id = $1 AND session_id = $2`, [optionId, id]);
  if (!option) return NextResponse.json({ error: "Option not found" }, { status: 404 });

  // Build a scores map with 1 point for the picked option, 0 for all others
  const allOptions = await query<Option>(`SELECT * FROM options WHERE session_id = $1`, [id]);
  const scores: Record<string, number> = {};
  for (const o of allOptions) scores[o.id] = o.id === optionId ? 1 : 0;

  await query(
    `INSERT INTO results (session_id, winner_id, scores) VALUES ($1, $2, $3) ON CONFLICT (session_id) DO NOTHING`,
    [id, optionId, JSON.stringify(scores)]
  );
  await query(`UPDATE sessions SET status = 'done' WHERE id = $1`, [id]);
  emit(id, { type: "status_changed", status: "done" });

  return new NextResponse(null, { status: 204 });
}
