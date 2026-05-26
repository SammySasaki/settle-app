import { EventEmitter } from "events";

// Single in-process emitter shared across all API routes (single Railway instance).
// Events are keyed by sessionId. The SSE endpoint subscribes; API routes emit.
declare global {
  // eslint-disable-next-line no-var
  var _sessionEmitter: EventEmitter | undefined;
}

export const sessionEmitter =
  globalThis._sessionEmitter ?? new EventEmitter().setMaxListeners(200);
if (process.env.NODE_ENV !== "production") globalThis._sessionEmitter = sessionEmitter;

export type SessionEvent =
  | { type: "participant_joined"; participant: { id: string; name: string; ranking_done: boolean } }
  | { type: "option_added"; option: { id: string; text: string; suggested_by: string; metadata: import("./types").OptionMetadata | null } }
  | { type: "option_removed"; optionId: string }
  | { type: "status_changed"; status: string }
  | { type: "participant_done"; participantId: string }
  | { type: "tiebreak_started"; tiedOptionIds: string[] }
  | { type: "tiebreak_vote"; participantId: string };

export function emit(sessionId: string, event: SessionEvent) {
  sessionEmitter.emit(sessionId, event);
}

export function subscribe(sessionId: string, handler: (event: SessionEvent) => void) {
  sessionEmitter.on(sessionId, handler);
  return () => sessionEmitter.off(sessionId, handler);
}
