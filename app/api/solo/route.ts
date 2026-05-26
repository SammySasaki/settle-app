import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { searchPlace } from "@/lib/places";
import type { PlaceDetails } from "@/lib/places";

const anthropic = new Anthropic();

export interface SoloOption {
  text: string;
  description: string;
  link: string;
  address?: string;
  rating?: number;
  ratingCount?: number;
  priceLevel?: string;
  website?: string;
  openNow?: boolean;
  todayHours?: string;
}

export async function POST(req: Request) {
  const { topic, location, preferences, exclude } = await req.json() as {
    topic: string;
    location?: string;
    preferences?: string;
    exclude?: string[];
  };

  if (!topic?.trim()) {
    return NextResponse.json({ error: "Topic is required" }, { status: 400 });
  }

  const ctx = [
    location?.trim() ? `Location: ${location.trim()}` : "",
    preferences?.trim() ? `Preferences: ${preferences.trim()}` : "",
  ].filter(Boolean).join("\n");

  const systemPrompt = `You are helping someone decide: "${topic.trim()}"${ctx ? `\n${ctx}` : ""}`;

  const excludeClause = exclude && exclude.length > 0
    ? `\nAlready seen — do not suggest these: ${exclude.map(e => `"${e}"`).join(", ")}`
    : "";

  // Pass 1 — generate ~10 raw candidate names
  const pass1 = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    messages: [{
      role: "user",
      content: `${systemPrompt}\n\nGenerate 10 distinct, specific candidates. Reply with ONLY a JSON array of strings.\nExample: ["Option A", "Option B"]${excludeClause}`,
    }],
  });

  const pass1Content = pass1.content[0];
  if (pass1Content.type !== "text") {
    return NextResponse.json({ error: "Unexpected AI response" }, { status: 500 });
  }

  let candidateNames: string[];
  try {
    const raw = pass1Content.text.trim();
    const jsonText = raw.startsWith("```") ? raw.replace(/^```[^\n]*\n?/, "").replace(/```$/, "").trim() : raw;
    candidateNames = JSON.parse(jsonText);
    if (!Array.isArray(candidateNames)) throw new Error();
  } catch {
    return NextResponse.json({ error: "Failed to parse candidates" }, { status: 500 });
  }

  // Look up all candidates in Google Places in parallel
  // Query includes location for better targeting
  const placeResults: (PlaceDetails | null)[] = await Promise.all(
    candidateNames.map((name) =>
      searchPlace(`${name}${location?.trim() ? ` ${location.trim()}` : ""}`)
    )
  );

  const hasPlacesData = placeResults.some((p) => p !== null);

  // Build context block for Pass 2
  const candidatesContext = candidateNames.map((name, i) => {
    const place = placeResults[i];
    if (!place) return `${i + 1}. ${name}`;
    const lines = [`${i + 1}. ${place.name}`];
    if (place.address) lines.push(`   Address: ${place.address}`);
    if (place.rating != null) {
      const count = place.ratingCount ? ` (${place.ratingCount.toLocaleString()} reviews)` : "";
      lines.push(`   Rating: ${place.rating}${count}`);
    }
    if (place.priceLevel) lines.push(`   Price: ${place.priceLevel}`);
    if (place.openNow != null) lines.push(`   ${place.openNow ? "Open now" : "Closed"}: ${place.todayHours ?? ""}`);
    if (place.editorialSummary) lines.push(`   Note: ${place.editorialSummary}`);
    return lines.join("\n");
  }).join("\n\n");

  const filterContext = [
    `"${topic.trim()}"`,
    location?.trim() ? `in ${location.trim()}` : "",
    preferences?.trim() ? `with preferences: ${preferences.trim()}` : "",
  ].filter(Boolean).join(" ");

  const pass2UserContent = hasPlacesData
    ? `Here is real data from Google Places for each candidate:\n\n${candidatesContext}\n\nSelect the best 5–7 that genuinely fit ${filterContext}. Remove any that don't exist or don't fit.\n\nFor each selected option write a tight one-line description using the real data above.\n\nReply with ONLY a JSON array using the candidate's 1-based number:\n[{ "index": 1, "description": "..." }]`
    : `Review those candidates. Keep the best 5–7 that genuinely fit ${filterContext}. Remove anything off-topic or too generic.\n\nFor each keeper write a tight one-line description.\n\nReply with ONLY a JSON array:\n[{ "index": 1, "description": "..." }]`;

  // Pass 2 — verify, select, and enrich with real data context
  const pass2 = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    messages: [
      { role: "user", content: `${systemPrompt}\n\nGenerate 10 distinct, specific candidates. Reply with ONLY a JSON array of strings.\nExample: ["Option A", "Option B"]` },
      { role: "assistant", content: pass1Content.text },
      { role: "user", content: pass2UserContent },
    ],
  });

  const pass2Content = pass2.content[0];
  if (pass2Content.type !== "text") {
    return NextResponse.json({ error: "Unexpected AI response" }, { status: 500 });
  }

  interface Selected { index: number; description: string }
  let selected: Selected[];
  try {
    const raw = pass2Content.text.trim();
    const jsonText = raw.startsWith("```") ? raw.replace(/^```[^\n]*\n?/, "").replace(/```$/, "").trim() : raw;
    selected = JSON.parse(jsonText);
    if (!Array.isArray(selected)) throw new Error();
  } catch {
    return NextResponse.json({ error: "Failed to parse suggestions" }, { status: 500 });
  }

  const options: SoloOption[] = selected.slice(0, 7).map(({ index, description }) => {
    const name = candidateNames[index - 1] ?? candidateNames[0];
    const place = placeResults[index - 1];
    return {
      text: place?.name ?? name,
      description,
      link: `https://www.google.com/search?q=${encodeURIComponent(place?.name ?? name)}`,
      address: place?.address,
      rating: place?.rating,
      ratingCount: place?.ratingCount,
      priceLevel: place?.priceLevel,
      website: place?.website,
      openNow: place?.openNow,
      todayHours: place?.todayHours,
    };
  });

  return NextResponse.json({ options });
}
