import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { emit } from "@/lib/events";
import type { Option } from "@/lib/types";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { text, suggestedBy } = await req.json();
  if (!text) return NextResponse.json({ error: "Missing text" }, { status: 400 });

  const option = await queryOne<Option>(
    `INSERT INTO options (session_id, text, suggested_by)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [id, text, suggestedBy ?? "Someone"]
  );
  if (!option) return NextResponse.json({ error: "Insert failed" }, { status: 500 });

  emit(id, { type: "option_added", option: { id: option.id, text: option.text, suggested_by: option.suggested_by, metadata: null } });
  return NextResponse.json(option);
}
