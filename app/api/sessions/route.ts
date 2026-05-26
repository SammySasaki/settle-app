import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import type { Session, Participant } from "@/lib/types";

export async function POST(req: Request) {
  const { topic, name } = await req.json();
  if (!topic || !name) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const session = await queryOne<Session>(
    `INSERT INTO sessions (topic, created_by)
     VALUES ($1, $2)
     RETURNING *`,
    [topic, name]
  );
  if (!session) return NextResponse.json({ error: "Failed to create session" }, { status: 500 });

  const participant = await queryOne<Participant>(
    `INSERT INTO participants (session_id, name)
     VALUES ($1, $2)
     RETURNING *`,
    [session.id, name]
  );
  if (!participant) return NextResponse.json({ error: "Failed to create participant" }, { status: 500 });

  return NextResponse.json({ sessionId: session.id, participantId: participant.id });
}
