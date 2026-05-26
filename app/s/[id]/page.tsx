"use client";

import { useEffect, useState, use } from "react";
import type { Session, Participant, Option, SessionStatus } from "@/lib/types";
import type { SessionEvent } from "@/lib/events";
import { Lobby } from "@/components/Lobby";
import { Ranking } from "@/components/Ranking";
import { Tiebreak } from "@/components/Tiebreak";
import { Result } from "@/components/Result";

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [session, setSession] = useState<Session | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [myParticipantId, setMyParticipantId] = useState<string | null>(null);
  const [myName, setMyName] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [joined, setJoined] = useState(false);
  const [tiebreakVoterIds, setTiebreakVoterIds] = useState<string[]>([]);

  // Load identity from sessionStorage
  useEffect(() => {
    const pid = sessionStorage.getItem(`participant_${id}`);
    const name = sessionStorage.getItem(`name_${id}`);
    setMyParticipantId(pid);
    setMyName(name);
    setJoined(!!pid);
  }, [id]);

  // Initial data fetch
  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/sessions/${id}`);
      if (!res.ok) { setNotFound(true); return; }
      const data = await res.json();
      setSession(data.session);
      setParticipants(data.participants);
      setOptions(data.options);
    }
    load();
  }, [id]);

  // SSE subscription
  useEffect(() => {
    const es = new EventSource(`/api/sessions/${id}/stream`);

    es.onmessage = (e) => {
      const event: SessionEvent = JSON.parse(e.data);

      if (event.type === "participant_joined") {
        setParticipants((prev) =>
          prev.some((p) => p.id === event.participant.id)
            ? prev
            : [...prev, { ...event.participant, session_id: id, joined_at: new Date().toISOString() }]
        );
      } else if (event.type === "option_added") {
        setOptions((prev) =>
          prev.some((o) => o.id === event.option.id)
            ? prev
            : [...prev, { ...event.option, session_id: id, created_at: new Date().toISOString() }]
        );
      } else if (event.type === "option_removed") {
        setOptions((prev) => prev.filter((o) => o.id !== event.optionId));
      } else if (event.type === "status_changed") {
        setSession((prev) => prev ? { ...prev, status: event.status as SessionStatus } : prev);
      } else if (event.type === "participant_done") {
        setParticipants((prev) =>
          prev.map((p) => p.id === event.participantId ? { ...p, ranking_done: true } : p)
        );
      } else if (event.type === "tiebreak_started") {
        setSession((prev) => prev ? { ...prev, status: "tiebreak", tiebreak_options: event.tiedOptionIds } : prev);
        setTiebreakVoterIds([]);
      } else if (event.type === "tiebreak_vote") {
        setTiebreakVoterIds((prev) =>
          prev.includes(event.participantId) ? prev : [...prev, event.participantId]
        );
      }
    };

    return () => es.close();
  }, [id]);

  async function handleJoin(name: string) {
    const res = await fetch(`/api/sessions/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return;
    const { participantId } = await res.json();
    sessionStorage.setItem(`participant_${id}`, participantId);
    sessionStorage.setItem(`name_${id}`, name);
    setMyParticipantId(participantId);
    setMyName(name);
    setJoined(true);
    // Don't add optimistically — the SSE participant_joined event handles it for all clients including this one
  }

  if (notFound) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Session not found or has expired.</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    );
  }

  const isHost = session.created_by === myName;
  const status = session.status;

  if (!joined || !myParticipantId) {
    return <Lobby session={session} participants={participants} options={options} onJoin={handleJoin} myParticipantId={null} isHost={false} />;
  }

  if (status === "lobby" || status === "collecting") {
    return <Lobby session={session} participants={participants} options={options} onJoin={handleJoin} myParticipantId={myParticipantId} isHost={isHost} />;
  }

  if (status === "ranking") {
    return <Ranking session={session} options={options} myParticipantId={myParticipantId} participants={participants} isSolo={participants.length === 1} />;
  }

  if (status === "tiebreak") {
    const tiedOptions = options.filter((o) => session.tiebreak_options?.includes(o.id));
    return (
      <Tiebreak
        key={session.tiebreak_options?.join(",")}
        sessionId={id}
        tiedOptions={tiedOptions}
        myParticipantId={myParticipantId}
        participants={participants}
        voterIds={tiebreakVoterIds}
      />
    );
  }

  return <Result sessionId={id} options={options} />;
}
