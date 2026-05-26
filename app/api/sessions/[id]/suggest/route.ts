import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { queryOne, query } from "@/lib/db";
import { emit } from "@/lib/events";
import type { Session, Option } from "@/lib/types";

const anthropic = new Anthropic();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { preferences?: string; location?: string };
  const preferences = typeof body.preferences === "string" && body.preferences.trim()
    ? body.preferences.trim()
    : null;
  const location = typeof body.location === "string" && body.location.trim()
    ? body.location.trim()
    : null;

  const session = await queryOne<Session>(`SELECT * FROM sessions WHERE id = $1`, [id]);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const aiCount = await queryOne<{ count: string }>(
    `SELECT COUNT(*) AS count FROM options WHERE session_id = $1 AND suggested_by = 'AI'`,
    [id]
  );
  if (parseInt(aiCount?.count ?? "0") > 0) {
    return NextResponse.json({ error: "AI suggestions already generated" }, { status: 409 });
  }

  const existing = await query<{ text: string }>(`SELECT text FROM options WHERE session_id = $1`, [id]);
  const existingTexts = existing.map((o) => o.text);

  const contextLine = [
    location ? `Location: ${location}` : "",
    preferences ? `Preferences: ${preferences}` : "",
  ].filter(Boolean).join("\n");
  const avoidLine = existingTexts.length > 0
    ? `\nAlready suggested (exclude these): ${existingTexts.join(", ")}`
    : "";

  const ctx = contextLine ? `\n${contextLine}` : "";
  const systemPrompt = `You are helping a group decide: "${session.topic}"${ctx}${avoidLine}`;

  // Pass 1 — generate ~10 raw candidates (names only, fast)
  const pass1 = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    messages: [{
      role: "user",
      content: `${systemPrompt}\n\nGenerate 10 distinct, specific candidates. Reply with ONLY a JSON array of strings.\nExample: ["Option A", "Option B"]`,
    }],
  });

  const pass1Content = pass1.content[0];
  if (pass1Content.type !== "text") {
    return NextResponse.json({ error: "Unexpected response from AI" }, { status: 500 });
  }

  const filterContext = [
    `"${session.topic}"`,
    location ? `in ${location}` : "",
    preferences ? `with preferences: ${preferences}` : "",
  ].filter(Boolean).join(" ");

  // Pass 2 — verify, filter to best 5–7, add descriptions (multi-turn conversation)
  const pass2 = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    messages: [
      { role: "user", content: `${systemPrompt}\n\nGenerate 10 distinct, specific candidates. Reply with ONLY a JSON array of strings.\nExample: ["Option A", "Option B"]` },
      { role: "assistant", content: pass1Content.text },
      {
        role: "user",
        content: `Review those candidates. Keep the best 5–7 that genuinely fit ${filterContext}. Remove anything off-topic or too generic.

For each keeper, write a tight one-line description (what makes it a good fit, any standout detail).

Reply with ONLY a JSON array — no markdown, no explanation:
[{ "text": "...", "description": "..." }]`,
      },
    ],
  });

  const pass2Content = pass2.content[0];
  if (pass2Content.type !== "text") {
    return NextResponse.json({ error: "Unexpected response from AI" }, { status: 500 });
  }

  interface Candidate { text: string; description: string }
  let candidates: Candidate[];
  try {
    const raw = pass2Content.text.trim();
    // Strip markdown code fences if Claude wrapped it
    const jsonText = raw.startsWith("```") ? raw.replace(/^```[^\n]*\n?/, "").replace(/```$/, "").trim() : raw;
    candidates = JSON.parse(jsonText);
    if (!Array.isArray(candidates) || !candidates.every((c) => typeof c.text === "string")) throw new Error();
  } catch {
    return NextResponse.json({ error: "Failed to parse AI suggestions" }, { status: 500 });
  }

  for (const candidate of candidates.slice(0, 7)) {
    // Generate link server-side — never let Claude produce URLs (hallucination risk)
    const link = `https://www.google.com/search?q=${encodeURIComponent(candidate.text)}`;
    const metadata = { description: candidate.description, link };

    const option = await queryOne<Option>(
      `INSERT INTO options (session_id, text, suggested_by, metadata)
       VALUES ($1, $2, 'AI', $3) RETURNING *`,
      [id, candidate.text, JSON.stringify(metadata)]
    );
    if (option) {
      emit(id, { type: "option_added", option: { id: option.id, text: option.text, suggested_by: "AI", metadata: option.metadata } });
    }
  }

  return NextResponse.json({ added: candidates.length });
}
