"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Home() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim() || !name.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), name: name.trim() }),
      });
      if (!res.ok) throw new Error("Failed to create session");
      const { sessionId, participantId } = await res.json();
      sessionStorage.setItem(`participant_${sessionId}`, participantId);
      sessionStorage.setItem(`name_${sessionId}`, name.trim());
      router.push(`/s/${sessionId}`);
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Settle</h1>
          <p className="text-muted-foreground">
            Stop debating. Let everyone vote, and let&apos;s settle it.
          </p>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="topic">
              What do you need to decide?
            </label>
            <Input
              id="topic"
              placeholder="Places to eat in Las Vegas, movie tonight, next trip…"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="name">
              Your name
            </label>
            <Input
              id="name"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="submit"
            className="w-full"
            disabled={!topic.trim() || !name.trim() || loading}
          >
            {loading ? "Creating…" : "Start a session"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Deciding alone?{" "}
          <a href="/solo" className="underline underline-offset-4 hover:text-foreground transition-colors">
            Solo mode
          </a>
        </p>
      </div>
    </main>
  );
}
