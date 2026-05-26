"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SoloOption } from "@/app/api/solo/route";

type Phase = "form" | "loading" | "browsing" | "picked";

export default function SoloPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("form");
  const [topic, setTopic] = useState("");
  const [location, setLocation] = useState("");
  const [preferences, setPreferences] = useState("");
  const [detectingLocation, setDetectingLocation] = useState(false);

  // Browsing state
  const [current, setCurrent] = useState<SoloOption[]>([]);
  const [kept, setKept] = useState<SoloOption[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);

  const [picked, setPicked] = useState<SoloOption | null>(null);
  const [error, setError] = useState("");

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
          setLocation(place);
        } catch { /* leave field as-is */ }
        setDetectingLocation(false);
      },
      () => setDetectingLocation(false)
    );
  }

  async function fetchOptions(exclude: string[]): Promise<SoloOption[]> {
    const res = await fetch("/api/solo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: topic.trim(),
        location: location.trim() || undefined,
        preferences: preferences.trim() || undefined,
        exclude: exclude.length > 0 ? exclude : undefined,
      }),
    });
    if (!res.ok) throw new Error();
    const { options } = await res.json() as { options: SoloOption[] };
    return options;
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;
    setError("");
    setPhase("loading");
    setKept([]);
    setSeen([]);

    try {
      const options = await fetchOptions([]);
      const names = options.map(o => o.text);
      setSeen(names);
      setCurrent(options);
      setPhase("browsing");
    } catch {
      setError("Something went wrong. Please try again.");
      setPhase("form");
    }
  }

  async function handleGenerateMore() {
    setLoadingMore(true);
    try {
      const exclude = seen;
      const options = await fetchOptions(exclude);
      const newNames = options.map(o => o.text);
      setSeen(prev => [...prev, ...newNames]);
      setCurrent(options);
    } catch {
      setError("Couldn't load more options. Try again.");
    } finally {
      setLoadingMore(false);
    }
  }

  function handleKeep(option: SoloOption) {
    setKept(prev => [...prev, option]);
    setCurrent(prev => prev.filter(o => o.text !== option.text));
  }

  function handleSkip(option: SoloOption) {
    setCurrent(prev => prev.filter(o => o.text !== option.text));
  }

  function handlePick(option: SoloOption) {
    setPicked(option);
    setPhase("picked");
  }

  function reset() {
    setPhase("form");
    setCurrent([]);
    setKept([]);
    setSeen([]);
    setPicked(null);
    setError("");
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <AnimatePresence mode="wait">

        {/* Form */}
        {phase === "form" && (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="w-full max-w-md space-y-8"
          >
            <div className="space-y-1">
              <button onClick={() => router.push("/")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                ← Group mode
              </button>
              <h1 className="text-3xl font-bold tracking-tight">Settle it yourself</h1>
              <p className="text-muted-foreground text-sm">Tell us what you&apos;re deciding and we&apos;ll generate options.</p>
            </div>

            <form onSubmit={handleGenerate} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="topic">What do you need to decide?</label>
                <Input
                  id="topic"
                  placeholder="Restaurants near me, movie tonight, weekend activity…"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="location">Location <span className="text-muted-foreground font-normal">(optional)</span></label>
                <div className="flex gap-2">
                  <Input
                    id="location"
                    placeholder="Las Vegas, Brooklyn, near me…"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={detectLocation}
                    disabled={detectingLocation}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors px-2 disabled:opacity-50"
                    title="Detect my location"
                  >
                    {detectingLocation ? "…" : "⌖"}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="prefs">Preferences <span className="text-muted-foreground font-normal">(optional)</span></label>
                <Input
                  id="prefs"
                  placeholder="Italian, vegetarian, under $30, date night…"
                  value={preferences}
                  onChange={(e) => setPreferences(e.target.value)}
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" className="w-full" disabled={!topic.trim()}>
                Generate options
              </Button>
            </form>
          </motion.div>
        )}

        {/* Loading */}
        {phase === "loading" && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center space-y-3"
          >
            <p className="text-lg font-medium">Finding the best options…</p>
            <p className="text-sm text-muted-foreground">{topic}</p>
          </motion.div>
        )}

        {/* Browsing */}
        {phase === "browsing" && (
          <motion.div
            key="browsing"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-lg space-y-6"
          >
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Settling</p>
              <h2 className="text-2xl font-bold leading-snug">{topic}</h2>
              {(location || preferences) && (
                <p className="text-sm text-muted-foreground">
                  {[location, preferences].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>

            {/* Shortlist */}
            {kept.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Shortlist</p>
                <div className="space-y-2">
                  {kept.map((option) => (
                    <div
                      key={option.text}
                      className="rounded-xl border border-border bg-muted/40 px-4 py-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-sm leading-snug truncate">{option.text}</p>
                        {option.address && (
                          <p className="text-xs text-muted-foreground truncate">{option.address}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {option.rating != null && (
                          <span className="text-xs text-muted-foreground">★ {option.rating.toFixed(1)}</span>
                        )}
                        <Button size="sm" className="text-xs h-7 px-3" onClick={() => handlePick(option)}>
                          Pick
                        </Button>
                        <button
                          onClick={() => setKept(prev => prev.filter(o => o.text !== option.text))}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          title="Remove from shortlist"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Current batch */}
            {current.length > 0 ? (
              <div className="space-y-3">
                {kept.length > 0 && (
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">More options</p>
                )}
                {current.map((option, i) => (
                  <motion.div
                    key={option.text}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="rounded-xl border-2 border-border bg-card p-4 space-y-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold leading-snug">{option.text}</p>
                        <div className="flex items-center gap-1.5 shrink-0 text-xs text-muted-foreground">
                          {option.rating != null && (
                            <span className="font-medium">★ {option.rating.toFixed(1)}</span>
                          )}
                          {option.priceLevel && (
                            <span>{option.priceLevel}</span>
                          )}
                        </div>
                      </div>

                      {(option.openNow != null || option.todayHours) && (
                        <p className="text-xs text-muted-foreground">
                          {option.openNow != null && (
                            <span className={option.openNow ? "text-green-600 dark:text-green-400" : "text-destructive"}>
                              {option.openNow ? "Open now" : "Closed"}
                            </span>
                          )}
                          {option.todayHours && (
                            <span> · {option.todayHours}</span>
                          )}
                        </p>
                      )}

                      {option.address && (
                        <p className="text-xs text-muted-foreground truncate">{option.address}</p>
                      )}

                      <p className="text-sm text-muted-foreground leading-snug pt-0.5">{option.description}</p>
                    </div>

                    <div className="flex gap-2">
                      <a
                        href={option.website ?? option.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1"
                      >
                        <Button variant="outline" className="w-full text-sm">
                          {option.website ? "Visit website ↗" : "Learn more ↗"}
                        </Button>
                      </a>
                      <Button variant="outline" className="text-sm px-4" onClick={() => handleSkip(option)}>
                        Skip
                      </Button>
                      <Button variant="outline" className="text-sm px-4" onClick={() => handleKeep(option)}>
                        Keep
                      </Button>
                      <Button className="text-sm px-4" onClick={() => handlePick(option)}>
                        Pick
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                {kept.length > 0 ? "All options browsed — pick from your shortlist or generate more." : "All options skipped."}
              </p>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="space-y-2 pt-2">
              <div className="flex gap-2">
                <Input
                  placeholder="Refine: more casual, open late, different area…"
                  value={preferences}
                  onChange={(e) => setPreferences(e.target.value)}
                  className="text-sm"
                />
                <button
                  type="button"
                  onClick={detectLocation}
                  disabled={detectingLocation}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors px-2 disabled:opacity-50 shrink-0"
                  title="Detect my location"
                >
                  {detectingLocation ? "…" : "⌖"}
                </button>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleGenerateMore}
                disabled={loadingMore}
              >
                {loadingMore ? "Finding more…" : "Generate more options"}
              </Button>
              <button onClick={reset} className="text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-center">
                ← Start over
              </button>
            </div>
          </motion.div>
        )}

        {/* Picked */}
        {phase === "picked" && picked && (
          <motion.div
            key="picked"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-6 max-w-sm w-full"
          >
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Settled</p>
              <motion.h1
                className="text-3xl font-bold leading-snug"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, type: "spring", stiffness: 260, damping: 20 }}
              >
                {picked.text}
              </motion.h1>
              {picked.address && (
                <p className="text-sm text-muted-foreground">{picked.address}</p>
              )}
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                {picked.rating != null && <span>★ {picked.rating.toFixed(1)}</span>}
                {picked.priceLevel && <span>{picked.priceLevel}</span>}
                {picked.openNow != null && (
                  <span className={picked.openNow ? "text-green-600 dark:text-green-400" : "text-destructive"}>
                    {picked.openNow ? "Open now" : "Closed"}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{picked.description}</p>
            </div>

            <div className="flex flex-col gap-2">
              <a href={picked.website ?? picked.link} target="_blank" rel="noopener noreferrer">
                <Button className="w-full">{picked.website ? "Visit website ↗" : "Search ↗"}</Button>
              </a>
              <Button variant="outline" className="w-full" onClick={reset}>
                Start over
              </Button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </main>
  );
}
