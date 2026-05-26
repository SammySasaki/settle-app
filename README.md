# Settle

Group decisions, made easy. Settle helps groups stop debating and actually pick something — where to eat, what to watch, where to go. Everyone ranks options privately through a series of A vs B choices; Settle aggregates the preferences and reveals a winner.

---

## How it works

1. **Host creates a session** — types a natural-language topic ("Places to eat in Las Vegas", "Movie tonight", "Next team trip")
2. **Share the link** — others join by entering their name, no account needed
3. **Collect options** — AI generates suggestions based on the topic; anyone can add their own
4. **Everyone ranks privately** — a series of A vs B comparisons (powered by merge sort, so far fewer questions than a full bracket)
5. **Result reveal** — animated reveal of the group's winner with a full score breakdown

---

## Stack

- **Next.js 16** — App Router, API routes, TypeScript
- **Tailwind CSS + shadcn/ui** — styling and components
- **Framer Motion** — result reveal animation
- **PostgreSQL** — Railway-hosted, direct `pg` connection
- **Server-Sent Events (SSE)** — real-time lobby and ranking updates, no WebSocket server
- **Claude API** — AI option suggestions from natural-language topics

---

## Running locally

**Prerequisites:** Node 18+, a PostgreSQL database (Railway works; see below)

**1. Clone and install**
```bash
git clone <repo>
cd pick
npm install
```

**2. Set up the database**

Create a PostgreSQL database (Railway is recommended — add a PostgreSQL service to your Railway project). Then run the schema:

```bash
# Connect to your database and run:
psql $DATABASE_URL -f db/schema.sql
```

Or paste the contents of `db/schema.sql` into Railway's built-in Query editor.

**3. Configure environment**
```bash
cp .env.example .env
```

Fill in `.env`:
```
DATABASE_URL=postgresql://user:password@host:5432/dbname
ANTHROPIC_API_KEY=sk-ant-...
CRON_SECRET=any-random-string   # only needed for the cleanup cron job
```

**4. Run**
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deploying to Railway

1. Push to GitHub and connect the repo in Railway
2. Railway auto-detects Next.js and builds with Nixpacks — no Dockerfile needed
3. Add a PostgreSQL service to your Railway project
4. Set environment variables in Railway → Variables:
   - `DATABASE_URL` — copy from the PostgreSQL service's Variables tab
   - `ANTHROPIC_API_KEY`
   - `CRON_SECRET` — generate with `openssl rand -hex 32`
5. Run `db/schema.sql` against the Railway database (Railway → PostgreSQL → Query tab)

**Session cleanup (optional):** Add a Railway Cron Job service on schedule `0 3 * * *` with command:
```
curl -s -X POST https://your-app.up.railway.app/api/cron/cleanup \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

## Project structure

```
app/
  page.tsx                          # Home — topic + name form, creates session, redirects to /s/[id]
  s/[id]/page.tsx                   # Session hub — owns all shared state (session, participants,
  |                                 # options, tiebreakVoterIds). Opens SSE stream, handles all
  |                                 # events, routes to the right component based on session status.
  api/
    sessions/
      route.ts                      # POST — create session
      [id]/
        route.ts                    # GET — fetch session + participants + options / POST — join
        status/route.ts             # PATCH — host advances status (lobby → collecting → ranking)
        options/route.ts            # POST — add an option
        options/[optionId]/route.ts # DELETE — remove an option
        suggest/route.ts            # POST — call Claude, insert AI options, emit SSE per option
        stream/route.ts             # GET — SSE endpoint, pushes JSON events to browser
        rankings/
          route.ts                  # POST — bulk insert pairwise comparisons (unnest)
          complete/route.ts         # POST — mark done, run Borda count, trigger tiebreak or finish
        tiebreak/
          vote/route.ts             # POST — record tiebreak pick, re-tiebreak or finalize winner
        result/route.ts             # GET — fetch result
    cron/
      cleanup/route.ts              # POST — delete expired sessions (cron auth required)

components/
  Lobby.tsx    # Join form, participant list, option collection, AI suggestion + preferences form
  Ranking.tsx  # Async merge-sort A/B UI — collects comparisons locally, submits batch when done
  Tiebreak.tsx # Single-pick vote between tied options — loops if still tied after all vote
  Result.tsx   # Animated winner reveal + score breakdown

lib/
  db.ts        # pg Pool (globalThis-cached for dev hot-reload), query() and queryOne() helpers
  events.ts    # In-memory EventEmitter — emit() for API routes, subscribe() for SSE endpoint
  types.ts     # Session, Participant, Option, Ranking, Result interfaces + SessionStatus enum

db/
  schema.sql   # Full PostgreSQL schema — run once against Railway PostgreSQL to initialize
```

---

## Data flow

Every mutation follows the same path: API route writes to Postgres, then broadcasts an event that all connected browsers receive instantly via SSE.

```
Browser action
      ↓
API route — writes to Postgres
      ↓
emit(sessionId, event) → in-memory EventEmitter
      ↓
SSE endpoint (stream/route.ts) pushes JSON → browser EventSource
      ↓
s/[id]/page.tsx handles event → updates React state → re-renders component
```

`s/[id]/page.tsx` is the single source of truth for client state. It fetches initial data on mount, then keeps everything in sync via SSE events for the lifetime of the session. It reads `session.status` to decide which component to render:

```
lobby → collecting → ranking → [tiebreak →]* done
  ↓          ↓           ↓          ↓          ↓
Lobby      Lobby      Ranking   Tiebreak    Result
```

The tiebreak loop (`→*`) repeats until a majority vote produces a unique winner.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for AI suggestions |
| `CRON_SECRET` | For cron | Bearer token protecting the cleanup endpoint |
