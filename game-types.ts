export type GamePhase = "lobby" | "prompt" | "answering" | "reveal" | "discussion" | "voting" | "results";

export type ClientActionStatus = {
  ok: true;
} | {
  ok: false;
  error: string;
};

export type ActionAck<T> = {
  ok: true;
  data: T;
} | {
  ok: false;
  error: string;
};

export interface PromptPair {
  realPrompt: string;
  fakePrompt: string;
  category: string;
}

export interface ChatMessage {
  id: string;
  roomCode: string;
  playerId: string;
  nickname: string;
  text: string;
  system?: boolean;
  createdAt: number;
}

export interface ScoreDelta {
  playerId: string;
  nickname: string;
  delta: number;
  reason: string;
}

export interface PlayerPublic {
  id: string;
  nickname: string;
  score: number;
  connected: boolean;
  ready: boolean;
  isHost: boolean;
  answered: boolean;
  voted: boolean;
  claimedImposter: boolean;
}

export interface RoundHistoryEntry {
  round: number;
  realPrompt: string;
  fakePrompt: string;
  imposterId: string;
  imposterNickname: string;
  caught: boolean;
  correctVotes: number;
  scoreChanges: ScoreDelta[];
  createdAt: number;
}

export interface RoomSnapshot {
  code: string;
  phase: GamePhase;
  round: number;
  maxPlayers: number;
  hostId: string;
  phaseEndsAt: number | null;
  players: PlayerPublic[];
  chat: ChatMessage[];
  history: RoundHistoryEntry[];
}

export interface PrivatePromptPayload {
  round: number;
  prompt: string;
  isImposter: boolean;
  phaseEndsAt: number;
}

export interface RevealAnswersPayload {
  round: number;
  answers: string[];
}

export interface ResultsPayload {
  round: number;
  imposterId: string;
  imposterNickname: string;
  realPrompt: string;
  fakePrompt: string;
  caught: boolean;
  votes: {
    playerId: string;
    playerNickname: string;
    targetId: string | null;
    targetNickname: string | null;
  }[];
  scoreChanges: ScoreDelta[];
  scoreboard: {
    playerId: string;
    nickname: string;
    score: number;
  }[];
}

export interface SessionPayload {
  room: RoomSnapshot;
  player: PlayerPublic;
  token: string;
}

export interface ServerToClientEvents {
  "room:state": (room: RoomSnapshot) => void;
  "room:error": (message: string) => void;
  "chat:new": (message: ChatMessage) => void;
  "game:private-prompt": (payload: PrivatePromptPayload) => void;
  "game:reveal-answers": (payload: RevealAnswersPayload) => void;
  "game:results": (payload: ResultsPayload) => void;
  "game:eject": (payload: { playerId: string; nickname: string }) => void;
}

export interface ClientToServerEvents {
  "room:create": (
    payload: { nickname: string },
    ack: (response: ActionAck<SessionPayload>) => void
  ) => void;
  "room:join": (
    payload: { roomCode: string; nickname: string; token?: string },
    ack: (response: ActionAck<SessionPayload>) => void
  ) => void;
  "room:ready": (payload: { ready: boolean }) => void;
  "room:sync": (ack: (response: ActionAck<SessionPayload>) => void) => void;
  "room:leave": () => void;
  "game:start": () => void;
  "game:answer": (payload: { answer: string }) => void;
  "imposter:claim": () => void;
  "chat:send": (payload: { text: string }) => void;
  "vote:cast": (payload: { targetId: string }) => void;
}

export interface SocketData {
  roomCode?: string;
  playerId?: string;
  token?: string;
}
