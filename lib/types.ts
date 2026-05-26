export type SessionStatus = "lobby" | "collecting" | "ranking" | "tiebreak" | "done";

export interface Session {
  id: string;
  topic: string;
  created_by: string;
  status: SessionStatus;
  tiebreak_options: string[] | null;
  created_at: string;
  expires_at: string;
}

export interface Participant {
  id: string;
  session_id: string;
  name: string;
  joined_at: string;
  ranking_done: boolean;
}

export interface OptionMetadata {
  description: string;
  link: string;
}

export interface Option {
  id: string;
  session_id: string;
  text: string;
  suggested_by: string;
  metadata: OptionMetadata | null;
  created_at: string;
}

export interface Ranking {
  id: string;
  session_id: string;
  participant_id: string;
  option_a_id: string;
  option_b_id: string;
  preferred_id: string;
  created_at: string;
}

export interface Result {
  id: string;
  session_id: string;
  winner_id: string;
  scores: Record<string, number>;
  created_at: string;
}
