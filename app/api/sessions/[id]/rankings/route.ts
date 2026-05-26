import { NextResponse } from "next/server";
import { query } from "@/lib/db";

interface Comparison {
  aId: string;
  bId: string;
  preferredId: string;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { participantId, comparisons } = await req.json() as {
    participantId: string;
    comparisons: Comparison[];
  };

  if (!participantId || !Array.isArray(comparisons) || comparisons.length === 0) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Insert all comparisons in one query using unnest
  await query(
    `INSERT INTO rankings (session_id, participant_id, option_a_id, option_b_id, preferred_id)
     SELECT $1, $2, a_id, b_id, p_id
     FROM unnest($3::uuid[], $4::uuid[], $5::uuid[]) AS t(a_id, b_id, p_id)
     ON CONFLICT (participant_id, option_a_id, option_b_id) DO NOTHING`,
    [
      id,
      participantId,
      comparisons.map((c) => c.aId),
      comparisons.map((c) => c.bId),
      comparisons.map((c) => c.preferredId),
    ]
  );

  return new NextResponse(null, { status: 204 });
}
