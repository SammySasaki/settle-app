import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { emit } from "@/lib/events";
import type { Option, Ranking } from "@/lib/types";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { participantId } = await req.json();

  await query(
    `UPDATE participants SET ranking_done = true WHERE id = $1 AND session_id = $2`,
    [participantId, id]
  );
  emit(id, { type: "participant_done", participantId });

  // Check if all participants are done
  const incomplete = await queryOne<{ count: string }>(
    `SELECT COUNT(*) AS count FROM participants WHERE session_id = $1 AND ranking_done = false`,
    [id]
  );
  if (parseInt(incomplete?.count ?? "1") > 0) return new NextResponse(null, { status: 204 });

  // Run Borda count
  const options = await query<Option>(`SELECT * FROM options WHERE session_id = $1`, [id]);
  const rankings = await query<Ranking>(`SELECT * FROM rankings WHERE session_id = $1`, [id]);

  const scores: Record<string, number> = {};
  for (const o of options) scores[o.id] = 0;
  for (const r of rankings) scores[r.preferred_id] = (scores[r.preferred_id] ?? 0) + 1;

  const topScore = Math.max(...Object.values(scores));
  const tied = options.filter((o) => scores[o.id] === topScore);

  if (tied.length > 1) {
    // Real tie — kick off a tiebreak revote between the tied options
    await query(
      `UPDATE sessions SET status = 'tiebreak', tiebreak_options = $2 WHERE id = $1`,
      [id, tied.map((o) => o.id)]
    );
    emit(id, { type: "tiebreak_started", tiedOptionIds: tied.map((o) => o.id) });
    // Also emit status_changed so clients that only watch status route correctly
    emit(id, { type: "status_changed", status: "tiebreak" });
    return new NextResponse(null, { status: 204 });
  }

  const winnerId = tied[0].id;

  await query(
    `INSERT INTO results (session_id, winner_id, scores) VALUES ($1, $2, $3)`,
    [id, winnerId, JSON.stringify(scores)]
  );
  await query(`UPDATE sessions SET status = 'done' WHERE id = $1`, [id]);
  emit(id, { type: "status_changed", status: "done" });

  return new NextResponse(null, { status: 204 });
}
