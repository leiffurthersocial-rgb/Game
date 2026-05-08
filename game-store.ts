"use client";

import { create } from "zustand";
import type {
  ChatMessage,
  PrivatePromptPayload,
  ResultsPayload,
  RevealAnswersPayload,
  RoomSnapshot,
  SessionPayload
} from "@/shared/game-types";

interface GameStore {
  connection: "idle" | "connecting" | "connected" | "error";
  error: string | null;
  room: RoomSnapshot | null;
  session: SessionPayload | null;
  privatePrompt: PrivatePromptPayload | null;
  revealAnswers: RevealAnswersPayload | null;
  results: ResultsPayload | null;
  localAnswer: string;
  localVote: string | null;
  chatDraft: string;
  setConnection: (connection: GameStore["connection"]) => void;
  setError: (message: string | null) => void;
  setRoom: (room: RoomSnapshot | null) => void;
  setSession: (session: SessionPayload | null) => void;
  setPrivatePrompt: (payload: PrivatePromptPayload | null) => void;
  setRevealAnswers: (payload: RevealAnswersPayload | null) => void;
  setResults: (payload: ResultsPayload | null) => void;
  setLocalAnswer: (value: string) => void;
  setLocalVote: (value: string | null) => void;
  setChatDraft: (value: string) => void;
  addChatMessage: (message: ChatMessage) => void;
  clearRoundUi: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  connection: "idle",
  error: null,
  room: null,
  session: null,
  privatePrompt: null,
  revealAnswers: null,
  results: null,
  localAnswer: "",
  localVote: null,
  chatDraft: "",
  setConnection: (connection) => set({ connection }),
  setError: (error) => set({ error }),
  setRoom: (room) => set({ room }),
  setSession: (session) => set({ session }),
  setPrivatePrompt: (privatePrompt) => set({ privatePrompt }),
  setRevealAnswers: (revealAnswers) => set({ revealAnswers }),
  setResults: (results) => set({ results }),
  setLocalAnswer: (localAnswer) => set({ localAnswer }),
  setLocalVote: (localVote) => set({ localVote }),
  setChatDraft: (chatDraft) => set({ chatDraft }),
  addChatMessage: (message) =>
    set((state) => ({
      room: state.room
        ? { ...state.room, chat: [...state.room.chat, message].slice(-50) }
        : state.room
    })),
  clearRoundUi: () =>
    set({
      privatePrompt: null,
      revealAnswers: null,
      results: null,
      localAnswer: "",
      localVote: null
    })
}));
