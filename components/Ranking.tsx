"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Session, Participant, Option } from "@/lib/types";

interface Pair { a: Option; b: Option }
interface Comparison { aId: string; bId: string; preferredId: string }

interface Props {
  session: Session;
  options: Option[];
  myParticipantId: string;
  participants: Participant[];
  isSolo?: boolean;
}

// Merge sort that pauses at each comparison to ask the user.
async function mergeSort(
  items: Option[],
  askCompare: (a: Option, b: Option) => Promise<Option>
): Promise<Option[]> {
  if (items.length <= 1) return items;
  const mid = Math.floor(items.length / 2);
  const left = await mergeSort(items.slice(0, mid), askCompare);
  const right = await mergeSort(items.slice(mid), askCompare);

  const result: Option[] = [];
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    const preferred = await askCompare(left[i], right[j]);
    if (preferred.id === left[i].id) result.push(left[i++]);
    else result.push(right[j++]);
  }
  return [...result, ...left.slice(i), ...right.slice(j)];
}

// Elimination: champion faces each challenger in sequence. Loser is eliminated immediately.
// n-1 comparisons total — fastest possible to find a winner.
async function eliminate(
  items: Option[],
  askCompare: (a: Option, b: Option) => Promise<Option>
): Promise<Option> {
  let champion = items[0];
  for (let i = 1; i < items.length; i++) {
    champion = await askCompare(champion, items[i]);
  }
  return champion;
}

function estimateComparisons(n: number, isSolo: boolean): number {
  if (n <= 1) return 0;
  return isSolo ? n - 1 : Math.round(n * Math.log2(n));
}

export function Ranking({ session, options, myParticipantId, participants, isSolo = false }: Props) {
  const [currentPair, setCurrentPair] = useState<Pair | null>(null);
  const [answered, setAnswered] = useState(0);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [direction, setDirection] = useState<"left" | "right" | null>(null);

  // Bridge between the async merge sort and React event handlers
  const resolverRef = useRef<((preferred: Option) => void) | null>(null);
  const comparisonsRef = useRef<Comparison[]>([]);
  const estimated = estimateComparisons(options.length, isSolo);

  const doneCount = participants.filter((p) => p.ranking_done).length;

  useEffect(() => {
    if (options.length === 0) return;

    const shuffled = [...options].sort(() => Math.random() - 0.5);

    function askCompare(a: Option, b: Option): Promise<Option> {
      return new Promise((resolve) => {
        setCurrentPair({ a, b });
        resolverRef.current = (preferred: Option) => {
          comparisonsRef.current.push({ aId: a.id, bId: b.id, preferredId: preferred.id });
          setAnswered((n) => n + 1);
          resolve(preferred);
        };
      });
    }

    if (isSolo) {
      // Elimination: n-1 comparisons, call /pick with winner
      eliminate(shuffled, askCompare).then(async (winner) => {
        setCurrentPair(null);
        setSubmitting(true);
        await fetch(`/api/sessions/${session.id}/pick`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participantId: myParticipantId, optionId: winner.id }),
        });
        setSubmitting(false);
        setDone(true);
      });
    } else {
      // Merge sort: ~n·log₂n comparisons, submit full pairwise data
      mergeSort(shuffled, askCompare).then(async () => {
        setCurrentPair(null);
        setSubmitting(true);
        await fetch(`/api/sessions/${session.id}/rankings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participantId: myParticipantId, comparisons: comparisonsRef.current }),
        });
        await fetch(`/api/sessions/${session.id}/rankings/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participantId: myParticipantId }),
        });
        setSubmitting(false);
        setDone(true);
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handlePick(preferred: Option, dir: "left" | "right") {
    if (!resolverRef.current || submitting) return;
    setDirection(dir);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    // Small delay so the exit animation plays before state changes
    setTimeout(() => {
      setDirection(null);
      resolve(preferred);
    }, 180);
  }

  const doneWaiting = done || submitting;

  if (doneWaiting) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-2xl font-bold">{submitting ? "Submitting…" : "You're done!"}</p>
        {!submitting && (
          <>
            <p className="text-muted-foreground text-center">Waiting for everyone to finish…</p>
            <p className="text-sm text-muted-foreground">{doneCount} / {participants.length} finished</p>
            <div className="flex gap-1.5 mt-2">
              {participants.map((p) => (
                <div
                  key={p.id}
                  className={`w-2.5 h-2.5 rounded-full transition-colors ${p.ranking_done ? "bg-foreground" : "bg-muted"}`}
                  title={p.name}
                />
              ))}
            </div>
          </>
        )}
      </main>
    );
  }

  if (!currentPair) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    );
  }

  const progress = estimated > 0 ? Math.min(answered / estimated, 0.99) : 0;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 gap-8">
      <div className="w-full max-w-sm space-y-1 text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{session.topic}</p>
        <p className="text-sm text-muted-foreground">Which do you prefer?</p>
      </div>

      <div className="w-full max-w-sm h-1 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-foreground rounded-full transition-all duration-300"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={answered}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, x: direction === "left" ? -60 : direction === "right" ? 60 : 0 }}
          transition={{ duration: 0.18 }}
          className="w-full max-w-sm flex gap-4"
        >
          <button
            onClick={() => handlePick(currentPair.a, "left")}
            className="flex-1 rounded-xl border-2 border-border hover:border-foreground bg-card p-5 text-left transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
          >
            <p className="font-medium leading-snug">{currentPair.a.text}</p>
            <p className="mt-1 text-xs text-muted-foreground">{currentPair.a.suggested_by}</p>
          </button>

          <div className="flex items-center text-xs text-muted-foreground font-medium">vs</div>

          <button
            onClick={() => handlePick(currentPair.b, "right")}
            className="flex-1 rounded-xl border-2 border-border hover:border-foreground bg-card p-5 text-left transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
          >
            <p className="font-medium leading-snug">{currentPair.b.text}</p>
            <p className="mt-1 text-xs text-muted-foreground">{currentPair.b.suggested_by}</p>
          </button>
        </motion.div>
      </AnimatePresence>

      <p className="text-xs text-muted-foreground">
        ~{Math.max(estimated - answered, 1)} question{estimated - answered !== 1 ? "s" : ""} left
      </p>
    </main>
  );
}
