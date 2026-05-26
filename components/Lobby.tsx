"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { Session, Participant, Option } from "@/lib/types";

interface Props {
  session: Session;
  participants: Participant[];
  options?: Option[];
  myParticipantId: string | null;
  isHost: boolean;
  onJoin: (name: string) => Promise<void>;
}

export function Lobby({ session, participants, options = [], myParticipantId, isHost, onJoin }: Props) {
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [newOption, setNewOption] = useState("");
  const [addingOption, setAddingOption] = useState(false);
  const [generatingSuggestions, setGeneratingSuggestions] = useState(false);
  const [showPrefsForm, setShowPrefsForm] = useState(false);
  const [prefs, setPrefs] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Copy link");

  const joined = !!myParticipantId;
  const isCollecting = session.status === "collecting";
  const isSolo = isCollecting && participants.length === 1;
  const hasAiOptions = options.some((o) => o.suggested_by === "AI");
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  // Auto-generate AI suggestions when solo and collecting starts
  useEffect(() => {
    if (!isSolo || hasAiOptions || generatingSuggestions) return;
    handleGenerateSuggestions();
  }, [isSolo, hasAiOptions]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setJoining(true);
    await onJoin(name.trim());
    setJoining(false);
  }

  function copyLink() {
    navigator.clipboard.writeText(shareUrl);
    setCopyLabel("Copied!");
    setTimeout(() => setCopyLabel("Copy link"), 2000);
  }

  async function handleAddOption(e: React.FormEvent) {
    e.preventDefault();
    if (!newOption.trim()) return;
    setAddingOption(true);
    const participant = participants.find((p) => p.id === myParticipantId);
    await fetch(`/api/sessions/${session.id}/options`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: newOption.trim(), suggestedBy: participant?.name ?? "Someone" }),
    });
    setNewOption("");
    setAddingOption(false);
  }

  async function detectLocation() {
    if (!navigator.geolocation) return;
    setDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`,
            { headers: { "User-Agent": "Settle/1.0" } }
          );
          const data = await res.json();
          const place = data.address?.city || data.address?.town || data.address?.suburb || data.address?.state || "";
          setLocationInput(place);
        } catch { /* leave field empty */ }
        setDetectingLocation(false);
      },
      () => setDetectingLocation(false)
    );
  }

  async function handleGenerateSuggestions(opts?: { preferences?: string; location?: string }) {
    setShowPrefsForm(false);
    setGeneratingSuggestions(true);
    await fetch(`/api/sessions/${session.id}/suggest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preferences: opts?.preferences?.trim() || undefined,
        location: opts?.location?.trim() || undefined,
      }),
    });
    setGeneratingSuggestions(false);
  }

  async function handleStartCollecting() {
    await fetch(`/api/sessions/${session.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "collecting" }),
    });
  }

  async function handleStartRanking() {
    if (options.length < 2) return;
    setAdvancing(true);
    await fetch(`/api/sessions/${session.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ranking" }),
    });
    setAdvancing(false);
  }

  async function handlePick(optionId: string) {
    if (!myParticipantId) return;
    setAdvancing(true);
    await fetch(`/api/sessions/${session.id}/pick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optionId, participantId: myParticipantId }),
    });
    setAdvancing(false);
  }

  async function handleRemoveOption(optionId: string) {
    await fetch(`/api/sessions/${session.id}/options/${optionId}`, { method: "DELETE" });
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12">
      <div className="w-full max-w-lg space-y-8">
        {/* Header */}
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Settling</p>
          <h1 className="text-2xl font-bold leading-snug">{session.topic}</h1>
        </div>

        {/* Join form */}
        {!joined && (
          <form onSubmit={handleJoin} className="space-y-3">
            <p className="text-sm text-muted-foreground">Enter your name to join this session.</p>
            <div className="flex gap-2">
              <Input
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={joining}
                autoFocus
              />
              <Button type="submit" disabled={!name.trim() || joining}>
                {joining ? "Joining…" : "Join"}
              </Button>
            </div>
          </form>
        )}

        {/* Participants */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {participants.length} {participants.length === 1 ? "person" : "people"} here
            </p>
            <button
              onClick={copyLink}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {copyLabel}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {participants.map((p) => (
              <Badge key={p.id} variant={p.id === myParticipantId ? "default" : "secondary"}>
                {p.name}
                {p.id === myParticipantId && " (you)"}
              </Badge>
            ))}
          </div>
        </div>

        {/* Host: start collecting */}
        {joined && isHost && session.status === "lobby" && (
          <div className="space-y-2">
            <Button onClick={handleStartCollecting} className="w-full">
              Everyone&apos;s here — add options
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              This moves the group to the option-adding phase.
            </p>
          </div>
        )}

        {/* Non-host lobby waiting */}
        {joined && !isHost && session.status === "lobby" && (
          <p className="text-sm text-muted-foreground text-center">
            Waiting for {session.created_by} to start…
          </p>
        )}

        {/* Option collection phase */}
        {joined && isCollecting && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Options</p>

              {/* AI suggestion controls — hidden for solo (auto-generates) */}
              {isHost && !isSolo && (
                <div className="flex flex-col items-end gap-2">
                  {!hasAiOptions && !generatingSuggestions && !showPrefsForm && (
                    <button
                      onClick={() => setShowPrefsForm(true)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      ✦ Get AI suggestions
                    </button>
                  )}
                  {generatingSuggestions && (
                    <span className="text-xs text-muted-foreground opacity-50">Generating…</span>
                  )}
                  {hasAiOptions && !generatingSuggestions && (
                    <span className="text-xs text-muted-foreground opacity-50">✦ AI suggestions added</span>
                  )}
                  {showPrefsForm && (
                    <form
                      onSubmit={(e) => { e.preventDefault(); handleGenerateSuggestions({ preferences: prefs, location: locationInput }); }}
                      className="flex flex-col gap-2 w-full items-end"
                    >
                      <div className="flex gap-1.5 w-full items-center">
                        <Input
                          placeholder="Location (e.g. Las Vegas, Brooklyn)"
                          value={locationInput}
                          onChange={(e) => setLocationInput(e.target.value)}
                          className="text-xs h-8 flex-1"
                        />
                        <button
                          type="button"
                          onClick={detectLocation}
                          disabled={detectingLocation}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0 disabled:opacity-50"
                          title="Use my location"
                        >
                          {detectingLocation ? "…" : "⌖"}
                        </button>
                      </div>
                      <Input
                        autoFocus
                        placeholder="Preferences? (e.g. Italian, vegetarian, under $30)"
                        value={prefs}
                        onChange={(e) => setPrefs(e.target.value)}
                        className="text-xs h-8"
                      />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setShowPrefsForm(false)}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                          Cancel
                        </button>
                        <button type="button" onClick={() => handleGenerateSuggestions()}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                          Skip
                        </button>
                        <button type="submit"
                          className="text-xs font-medium hover:text-foreground transition-colors">
                          Generate
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* Solo: show generating state */}
              {isHost && isSolo && generatingSuggestions && (
                <span className="text-xs text-muted-foreground opacity-50">Generating…</span>
              )}
              {isHost && isSolo && hasAiOptions && !generatingSuggestions && (
                <span className="text-xs text-muted-foreground opacity-50">✦ AI suggestions added</span>
              )}
            </div>

            {options.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {generatingSuggestions ? "Getting suggestions…" : `No options yet.${isHost ? " Generate suggestions or add your own." : " Add your own below."}`}
              </p>
            )}

            <ul className="space-y-2">
              {options.map((o) => (
                <li key={o.id} className="flex items-start justify-between rounded-lg border px-3 py-2 text-sm gap-2">
                  <div className="min-w-0">
                    <span className="font-medium">{o.text}</span>
                    {o.metadata?.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{o.metadata.description}</p>
                    )}
                    {/* Solo: direct pick without ranking */}
                    {isSolo && isHost && (
                      <button
                        onClick={() => handlePick(o.id)}
                        disabled={advancing}
                        className="mt-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                      >
                        Pick this →
                      </button>
                    )}
                  </div>
                  <span className="flex items-center gap-2 shrink-0 pt-0.5">
                    {o.metadata?.link && (
                      <a
                        href={o.metadata.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={`Search ${o.text}`}
                      >
                        ↗
                      </a>
                    )}
                    <span className="text-xs text-muted-foreground">{o.suggested_by}</span>
                    {isHost && !isSolo && (
                      <button
                        onClick={() => handleRemoveOption(o.id)}
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="Remove option"
                      >
                        ✕
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>

            <form onSubmit={handleAddOption} className="flex gap-2">
              <Input
                placeholder="Add an option…"
                value={newOption}
                onChange={(e) => setNewOption(e.target.value)}
                disabled={addingOption}
              />
              <Button type="submit" variant="outline" disabled={!newOption.trim() || addingOption}>
                Add
              </Button>
            </form>

            {isHost && (
              <Button
                onClick={handleStartRanking}
                className="w-full"
                disabled={options.length < 2 || advancing}
              >
                {advancing ? "Starting…" : isSolo
                  ? `Rank these ${options.length} options`
                  : `Start ranking (${options.length} options)`}
              </Button>
            )}

            {!isHost && (
              <p className="text-xs text-center text-muted-foreground">
                Waiting for {session.created_by} to start the ranking…
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
