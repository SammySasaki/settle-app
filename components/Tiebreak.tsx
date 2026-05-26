"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { Option, Participant } from "@/lib/types";

interface Props {
  sessionId: string;
  tiedOptions: Option[];
  myParticipantId: string;
  participants: Participant[];
  voterIds: string[];
}

export function Tiebreak({ sessionId, tiedOptions, myParticipantId, participants, voterIds }: Props) {
  const [voted, setVoted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const voteCount = voterIds.length;
  const totalCount = participants.length;

  async function handleVote(optionId: string) {
    if (voted || submitting) return;
    setSubmitting(true);
    await fetch(`/api/sessions/${sessionId}/tiebreak/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId: myParticipantId, optionId }),
    });
    setSubmitting(false);
    setVoted(true);
  }

  if (voted) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-2xl font-bold">Voted!</p>
        <p className="text-muted-foreground text-center">Waiting for everyone to vote…</p>
        <p className="text-sm text-muted-foreground">{voteCount} / {totalCount} voted</p>
        <div className="flex gap-1.5 mt-2">
          {participants.map((p) => (
            <div
              key={p.id}
              className={`w-2.5 h-2.5 rounded-full transition-colors ${voterIds.includes(p.id) ? "bg-foreground" : "bg-muted"}`}
              title={p.name}
            />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 gap-8">
      <div className="w-full max-w-sm space-y-1 text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">It&apos;s a tie</p>
        <p className="text-lg font-bold">Cast your tiebreak vote</p>
        <p className="text-sm text-muted-foreground">Pick one to settle it.</p>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-3">
        {tiedOptions.map((option, i) => (
          <motion.button
            key={option.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.2 }}
            onClick={() => handleVote(option.id)}
            disabled={submitting}
            className="w-full rounded-xl border-2 border-border hover:border-foreground bg-card p-5 text-left transition-all duration-150 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
          >
            <p className="font-medium leading-snug">{option.text}</p>
          </motion.button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">{voteCount} / {totalCount} voted so far</p>
    </main>
  );
}
