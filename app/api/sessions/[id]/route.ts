import { NextResponse } from "next/server";
import { queryOne, query } from "@/lib/db";
import { emit } from "@/lib/events";
import type { Session, Participant, Option } from "@/lib/types";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await queryOne<Session>(`SELECT * FROM sessions WHERE id = $1`, [id]);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [participants, options] = await Promise.all([
    query<Participant>(`SELECT * FROM participants WHERE session_id = $1 ORDER BY joined_at`, [id]),
    query<Option>(`SELECT * FROM options WHERE session_id = $1 ORDER BY created_at`, [id]),
  ]);

  return NextResponse.json({ session, participants, options });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { name } = await req.json();
  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

  const participant = await queryOne<Participant>(
    `INSERT INTO participants (session_id, name) VALUES ($1, $2) RETURNING *`,
    [id, name]
  );
  if (!participant) return NextResponse.json({ error: "Insert failed" }, { status: 500 });

  emit(id, {
    type: "participant_joined",
    participant: { id: participant.id, name: participant.name, ranking_done: false },
  });

  return NextResponse.json({ participantId: participant.id, participant });
}
