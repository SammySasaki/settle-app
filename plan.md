# Settle

A group decision-making app. Groups are bad at deciding things together — where to eat, what movie to watch, where to travel. Existing tools collect votes but don't handle preference *aggregation*. Settle fixes this with ranked-preference voting and AI-generated options.

**Group decisions are the main product.** Single-user mode is a secondary feature powered by MCP integrations (Google Maps, Yelp, DoorDash) for real, locally-aware suggestions.

---

## How It Works

The host types a natural-language topic — anything from vague to specific:

> *"Places to eat in Las Vegas"*
> *"Activities near my hotel"*
> *"Location for our next team trip"*

The AI interprets the topic and generates relevant options. The host shares a link; everyone joins by entering their name (no account needed). Each person privately ranks options through a series of A vs B choices. Settle aggregates the group's preferences and reveals the winner.

---

## User Flow

```
Host enters topic
      ↓
Shareable link created  →  Others join (name only, no account)
      ↓
AI suggests options  +  Anyone can add their own
      ↓
Each person privately ranks  (A vs B comparisons)
      ↓
Borda count aggregates preferences
      ↓
Animated result reveal  (everyone sees it simultaneously)
```

---

## Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Next.js 16 + TypeScript | SSR, App Router, API routes built in |
| Styling | Tailwind CSS + shadcn/ui | Fast, polished, accessible components |
| Animation | Framer Motion | Result reveal should feel like a moment |
| Database | Railway PostgreSQL | Direct pg connection, no ORM |
| Realtime | Server-Sent Events (SSE) | Lightweight push from server; no WebSocket server needed |
| AI | Claude API (claude-sonnet-4-6) | Natural language topic → option suggestions |
| Hosting | Railway | Persistent container, existing plan already active |
| Phase 2 | Google Maps, Yelp, DoorDash (MCP) | Real local data for single-user mode |

---

## Data Model

```
sessions       topic, status (lobby | collecting | ranking | done), expires 24h
participants   name only — no account required to join
options        text + optional metadata (address, rating, image from MCP)
rankings       pairwise: option_a vs option_b → preferred_id
results        winner_id + scores jsonb — unique per session
```

---

## Realtime Architecture

API routes write to Postgres, then emit to an in-memory `EventEmitter` keyed by session ID. The SSE endpoint (`GET /api/sessions/[id]/stream`) subscribes to that emitter and pushes JSON events to the browser. The client uses `EventSource` and updates React state directly from the event payload — no polling, no WebSocket server.

```
API route mutates DB
      ↓
emit(sessionId, event)  →  in-memory EventEmitter
      ↓
SSE endpoint pushes  →  browser EventSource
      ↓
React state updates live
```

**Scale note:** The EventEmitter is in-process. If Railway ever runs multiple instances, this breaks — events only reach clients on the same instance. Fix at that point: replace the emitter with Redis pub/sub. Not needed until meaningful traffic.

---

## Key Design Choices

**Natural language topics** — the host describes what they need in plain English. The AI parses intent, location, and constraints from the prompt rather than requiring structured input.

**Merge-sort-driven A vs B comparisons** — instead of asking all n(n-1)/2 pairs (21 for 7 options), the ranking UI runs an async merge sort. The algorithm pauses at each step to ask the user one A vs B question, resolves on their pick, and continues. This reduces comparisons to ~n·log₂(n): roughly 10–13 for 7 options, 6–8 for 5. All comparisons are collected locally and submitted in a single batched DB insert when the sort completes. Capped at 7 options.

**No signup to join** — participants enter only a name. Removing the account gate is the most important UX decision. "Save this group" is offered *after* a session as an optional retention hook.

**Private rankings** — others see that you've voted, not how you voted. Prevents social pressure from distorting preferences.

**Result as a moment** — animated reveal via Framer Motion. Not a table of numbers — a shared experience.

**DB-level race condition guard** — `results` has a `unique (session_id)` constraint. If two participants finish ranking simultaneously and both trigger aggregation, only one insert succeeds. No application-level locking needed.

**AI suggestion rate limiting** — the suggest endpoint checks whether AI options already exist before calling Claude. The button disables in the UI once suggestions are generated. Prevents duplicate API spend from rapid clicks.

---

## Tradeoffs

| Decision | Chosen | Alternative | Why |
|---|---|---|---|
| Auth | Ephemeral (name only) | Accounts required | Signup friction kills group coordination apps |
| Realtime | SSE + in-memory EventEmitter | Supabase Realtime / Socket.io + Redis | No managed service dependency; simpler at single-instance scale |
| Ranking UX | Merge-sort A/B (~n·log₂n questions) | All-pairs (n(n-1)/2) or drag-and-drop | 21 questions for 7 options was too many; merge sort cuts it to ~12 |
| Aggregation | Borda count | Condorcet | Simpler; Condorcet has cycle edge cases |
| Options cap | 7 max | Unlimited | Keeps pairings manageable |
| MCP integrations | Phase 2 | Day 1 | Group mode is MVP; MCP adds API cost + complexity |

---

## Interesting Technical Problems

**1. Minimizing comparisons without losing accuracy** ✓ *solved*
Naive all-pairs gives n(n-1)/2 comparisons — 21 for 7 options, which felt like too many in practice. Solved with an async merge sort: the algorithm runs as a Promise chain, pausing at each step to await the user's pick via a `resolverRef`. This brings comparisons down to ~n·log₂(n) — 10–13 for 7 options. Options are shuffled before sorting so different participants see different comparison orders, reducing anchoring bias across the group. All comparisons are batched and submitted in a single DB insert on completion.

**2. Partial rankings — what if someone doesn't finish?**
Someone starts ranking and never comes back. Include whatever pairwise choices they completed, weighted by completion percentage. Requires Borda aggregation to handle sparse matrices — not every option-pair has a vote from every participant.

**3. Aggregation race conditions**
Two participants submit their final comparison simultaneously. Both see "everyone's done" and both try to insert a result. Handled by the `unique (session_id)` constraint on the results table — the second insert fails silently. No application lock needed.

**4. Constraint extraction from natural language**
"Activities near my hotel" has an implicit location dependency. "Something fun for 8 people, two vegetarians" has dietary constraints buried in the topic. The AI needs to either ask a follow-up or make assumptions explicit. Real prompt engineering and UI problem.

**5. Option deduplication**
Participants will submit "McDonald's", "McDonalds", and "Mickey D's" as three options. Fuzzy matching catches the obvious cases; semantic understanding handles the rest. Cleanest solution: AI deduplication before ranking starts, with a host-facing merge preview.

**6. The "one person hasn't voted" problem**
Everyone is waiting for that one person. UX options: nudge button, majority-complete threshold (e.g. 80%), per-person timer. Wrong choice here kills the group experience.

**7. Tie-breaking**
Borda count can produce ties in small groups. Deterministic fallback: head-to-head pairwise between tied options, then random if still tied. Randomization should be visible (coin-flip animation) rather than silent.

---

## Deployment — Railway

Railway runs Next.js as a persistent container — no cold starts, server stays warm. PostgreSQL runs as a separate Railway service in the same project.

**Environment variables (set in Railway → Variables):**
- `DATABASE_URL` — from the PostgreSQL service's Variables tab
- `ANTHROPIC_API_KEY` — from console.anthropic.com
- `CRON_SECRET` — random string for the cleanup cron job (`openssl rand -hex 32`)

**Deploy flow:** push to `main` → Railway auto-deploys via Nixpacks. No Dockerfile needed.

**Cron job (session cleanup):** Add a Railway Cron Job service when needed, schedule `0 3 * * *`, command:
```
curl -s -X POST https://your-app.up.railway.app/api/cron/cleanup \
  -H "Authorization: Bearer $CRON_SECRET"
```
Deletes sessions where `expires_at < now()` — cascades to all related rows.

---

## Phase Plan

**Phase 1 — MVP**
Session creation + shareable link, name-only join, natural language topic input, AI suggestions, pairwise ranking, Borda count aggregation, animated result reveal.

**Phase 2 — Enrich**
Single-user mode with MCP integrations (Google Maps, Yelp, DoorDash). Real option metadata: address, hours, ratings, delivery availability. Optional account creation to save groups.

**Phase 3 — Polish**
Session history, saved friend groups, push notifications, categories beyond food (movies, travel, activities). Redis pub/sub if multi-instance scale is needed.
