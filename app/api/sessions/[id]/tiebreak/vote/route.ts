import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { emit } from "@/lib/events";
import type { Option, Participant } from "@/lib/types";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { participantId, optionId } = await req.json() as { participantId: string; optionId: string };

  if (!participantId || !optionId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  await query(
    `INSERT INTO tiebreak_votes (session_id, participant_id, voted_for_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (session_id, participant_id) DO NOTHING`,
    [id, participantId, optionId]
  );
  emit(id, { type: "tiebreak_vote", participantId });

  // Check if all participants have voted
  const participants = await query<Participant>(`SELECT * FROM participants WHERE session_id = $1`, [id]);
  const votes = await query<{ voted_for_id: string }>(
    `SELECT voted_for_id FROM tiebreak_votes WHERE session_id = $1`, [id]
  );
  if (votes.length < participants.length) return new NextResponse(null, { status: 204 });

  // All voted — count tiebreak votes
  const tally: Record<string, number> = {};
  for (const v of votes) tally[v.voted_for_id] = (tally[v.voted_for_id] ?? 0) + 1;

  const topCount = Math.max(...Object.values(tally));
  const finalists = Object.keys(tally).filter((k) => tally[k] === topCount);

  // Still tied — wipe votes and start another tiebreak round
  if (finalists.length > 1) {
    await query(`DELETE FROM tiebreak_votes WHERE session_id = $1`, [id]);
    await query(`UPDATE sessions SET tiebreak_options = $2 WHERE id = $1`, [id, finalists]);
    emit(id, { type: "tiebreak_started", tiedOptionIds: finalists });
    return new NextResponse(null, { status: 204 });
  }

  const winnerId = finalists[0];

  // Build full score map (original Borda scores, not just tiebreak counts)
  const options = await query<Option>(`SELECT * FROM options WHERE session_id = $1`, [id]);
  const rankings = await query<{ preferred_id: string }>(
    `SELECT preferred_id FROM rankings WHERE session_id = $1`, [id]
  );
  const scores: Record<string, number> = {};
  for (const o of options) scores[o.id] = 0;
  for (const r of rankings) scores[r.preferred_id] = (scores[r.preferred_id] ?? 0) + 1;

  // Insert result — unique constraint silently drops duplicate if two requests race
  await query(
    `INSERT INTO results (session_id, winner_id, scores) VALUES ($1, $2, $3) ON CONFLICT (session_id) DO NOTHING`,
    [id, winnerId, JSON.stringify(scores)]
  );

  const winner = await queryOne<Option>(`SELECT * FROM options WHERE id = $1`, [winnerId]);
  if (!winner) return new NextResponse(null, { status: 500 });

  await query(`UPDATE sessions SET status = 'done' WHERE id = $1`, [id]);
  emit(id, { type: "status_changed", status: "done" });

  return new NextResponse(null, { status: 204 });
}
