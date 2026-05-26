-- Run this against your Railway PostgreSQL database
-- Railway connection string is in your Railway project → Variables → DATABASE_URL

create extension if not exists "pgcrypto";

-- Sessions
create table sessions (
  id                text primary key default encode(gen_random_bytes(4), 'hex'),
  topic             text not null,
  created_by        text not null,
  status            text not null default 'lobby'
                      check (status in ('lobby', 'collecting', 'ranking', 'tiebreak', 'done')),
  tiebreak_options  uuid[],
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null default now() + interval '24 hours'
);

-- Participants
create table participants (
  id            uuid primary key default gen_random_uuid(),
  session_id    text not null references sessions(id) on delete cascade,
  name          text not null,
  joined_at     timestamptz not null default now(),
  ranking_done  boolean not null default false
);

-- Options
create table options (
  id            uuid primary key default gen_random_uuid(),
  session_id    text not null references sessions(id) on delete cascade,
  text          text not null,
  suggested_by  text not null,
  metadata      jsonb,
  created_at    timestamptz not null default now()
);

-- Pairwise rankings
create table rankings (
  id              uuid primary key default gen_random_uuid(),
  session_id      text not null references sessions(id) on delete cascade,
  participant_id  uuid not null references participants(id) on delete cascade,
  option_a_id     uuid not null references options(id) on delete cascade,
  option_b_id     uuid not null references options(id) on delete cascade,
  preferred_id    uuid not null references options(id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (participant_id, option_a_id, option_b_id)
);

-- Results (unique per session — prevents duplicate aggregation on race condition)
create table results (
  id          uuid primary key default gen_random_uuid(),
  session_id  text not null references sessions(id) on delete cascade,
  winner_id   uuid not null references options(id),
  scores      jsonb not null,
  created_at  timestamptz not null default now(),
  unique (session_id)
);

-- Tiebreak votes (single-pick revote between tied options)
create table tiebreak_votes (
  id              uuid primary key default gen_random_uuid(),
  session_id      text not null references sessions(id) on delete cascade,
  participant_id  uuid not null references participants(id) on delete cascade,
  voted_for_id    uuid not null references options(id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (session_id, participant_id)
);

-- Indexes
create index on participants(session_id);
create index on options(session_id);
create index on rankings(session_id);
create index on rankings(participant_id);
