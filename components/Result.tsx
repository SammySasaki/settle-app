"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { Option } from "@/lib/types";

interface ResultData {
  winner_id: string;
  scores: Record<string, number>;
}

interface Props {
  sessionId: string;
  options: Option[];
}

export function Result({ sessionId, options }: Props) {
  const router = useRouter();
  const [result, setResult] = useState<ResultData | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/sessions/${sessionId}/result`);
      if (res.ok) {
        const data = await res.json();
        setResult(data);
        setTimeout(() => setRevealed(true), 600);
      }
    }
    load();
  }, [sessionId]);

  if (!result) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Tallying results…</p>
      </main>
    );
  }

  const winner = options.find((o) => o.id === result.winner_id);
  const maxScore = Math.max(...Object.values(result.scores));
  const ranked = options
    .map((o) => ({ ...o, score: result.scores[o.id] ?? 0 }))
    .sort((a, b) => b.score - a.score);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 gap-10">
      <div className="text-center space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          The group has spoken
        </p>
        <AnimatedWinner revealed={revealed} winner={winner?.text ?? "…"} />
        {revealed && winner?.metadata?.link && (
          <motion.a
            href={winner.metadata.link}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Search ↗
          </motion.a>
        )}
      </div>

      {revealed && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="w-full max-w-sm space-y-2"
        >
          {ranked.map((o, i) => (
            <div key={o.id} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-4 text-right">{i + 1}</span>
              <div className="flex-1 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className={o.id === result.winner_id ? "font-semibold" : ""}>{o.text}</span>
                  <span className="text-muted-foreground text-xs">{o.score} pts</span>
                </div>
                <div className="h-1 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-foreground rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: maxScore > 0 ? `${(o.score / maxScore) * 100}%` : "0%" }}
                    transition={{ delay: 0.5 + i * 0.08, duration: 0.4 }}
                  />
                </div>
              </div>
            </div>
          ))}
        </motion.div>
      )}

      {revealed && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}>
          <Button variant="outline" onClick={() => router.push("/")}>
            Start a new session
          </Button>
        </motion.div>
      )}
    </main>
  );
}

function AnimatedWinner({ revealed, winner }: { revealed: boolean; winner: string }) {
  return (
    <div className="relative h-16 flex items-center justify-center">
      {!revealed ? (
        <motion.p
          key="suspense"
          className="text-lg text-muted-foreground"
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ repeat: Infinity, duration: 1.2 }}
        >
          And the winner is…
        </motion.p>
      ) : (
        <motion.h1
          key="winner"
          className="text-3xl font-bold text-center"
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 18 }}
        >
          {winner}
        </motion.h1>
      )}
    </div>
  );
}
