import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { emit } from "@/lib/events";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; optionId: string }> }) {
  const { id, optionId } = await params;
  await query(`DELETE FROM options WHERE id = $1 AND session_id = $2`, [optionId, id]);
  emit(id, { type: "option_removed", optionId });
  return new NextResponse(null, { status: 204 });
}
