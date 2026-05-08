import { randomUUID } from "crypto";
import type { Server, Socket } from "socket.io";
import {
  MAX_CHAT_LENGTH,
  MAX_NICKNAME_LENGTH,
  MAX_PLAYERS,
  MIN_PLAYERS_TO_START,
  MAX_ANSWER_LENGTH,
  PROMPT_SECONDS,
  ANSWER_SECONDS,
  REVEAL_SECONDS,
  DISCUSSION_SECONDS,
  VOTING_SECONDS,
  RESULTS_SECONDS
} from "../src/lib/constants";
import { clampText, normalizeNickname, normalizeRoomCode, pickRandom, shuffle } from "../src/lib/utils";
import { PROMPT_PAIRS } from "../src/data/prompts";
import type {
  ActionAck,
  ChatMessage,
  ClientToServerEvents,
  GamePhase,
  PlayerPublic,
  PromptPair,
  PrivatePromptPayload,
  ResultsPayload,
  RevealAnswersPayload,
  RoundHistoryEntry,
  RoomSnapshot,
  ScoreDelta,
  ServerToClientEvents,
  SessionPayload,
  SocketData
} from "../src/shared/game-types";

type ManagerSocket = Socket<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;

interface PlayerRuntime extends PlayerPublic {
  token: string;
  socketId: string | null;
  answer: string | null;
  voteTargetId: string | null;
  isImposter: boolean;
  joinedAt: number;
}

interface Timers {
  prompt?: NodeJS.Timeout;
  answer?: NodeJS.Timeout;
  reveal?: NodeJS.Timeout;
  discussion?: NodeJS.Timeout;
  voting?: NodeJS.Timeout;
  cleanup?: NodeJS.Timeout;
}

interface RoomRuntime {
  code: string;
  phase: GamePhase;
  round: number;
  maxPlayers: number;
  hostId: string;
  phaseEndsAt: number | null;
  players: Map<string, PlayerRuntime>;
  chat: ChatMessage[];
  history: RoundHistoryEntry[];
  currentPrompt: PromptPair | null;
  imposterId: string | null;
  anonymousAnswers: string[];
  timers: Timers;
}

function generateRoomCode(existing: Set<string>) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  do {
    code = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  } while (existing.has(code));
  return code;
}

function makeToken() {
  return randomUUID();
}

function nowPlus(seconds: number) {
  return Date.now() + seconds * 1000;
}

function emptyRoom(code: string): RoomRuntime {
  return {
    code,
    phase: "lobby",
    round: 0,
    maxPlayers: MAX_PLAYERS,
    hostId: "",
    phaseEndsAt: null,
    players: new Map(),
    chat: [],
    history: [],
    currentPrompt: null,
    imposterId: null,
    anonymousAnswers: [],
    timers: {}
  };
}

export class RoomManager {
  private readonly rooms = new Map<string, RoomRuntime>();

  constructor(private readonly io: Server<ClientToServerEvents, ServerToClientEvents>) {}

  attach(socket: ManagerSocket) {
    socket.on("room:create", (payload, ack) => this.createRoom(socket, payload, ack));
    socket.on("room:join", (payload, ack) => this.joinRoom(socket, payload, ack));
    socket.on("room:ready", (payload) => this.setReady(socket, payload.ready));
    socket.on("room:sync", (ack) => this.syncRoom(socket, ack));
    socket.on("room:leave", () => this.leaveRoom(socket));
    socket.on("game:start", () => this.startGame(socket));
    socket.on("game:answer", (payload) => this.submitAnswer(socket, payload.answer));
    socket.on("imposter:claim", () => this.claimImposter(socket));
    socket.on("chat:send", (payload) => this.sendChat(socket, payload.text));
    socket.on("vote:cast", (payload) => this.castVote(socket, payload.targetId));

    socket.on("disconnect", () => {
      this.handleDisconnect(socket);
    });
  }

  private createRoom(socket: ManagerSocket, payload: { nickname: string }, ack: (response: ActionAck<SessionPayload>) => void) {
    const nickname = normalizeNickname(payload.nickname);
    if (nickname.length < 2) {
      ack({ ok: false, error: "Nickname must be at least 2 characters long." });
      return;
    }

    const code = generateRoomCode(new Set(this.rooms.keys()));
    const room = emptyRoom(code);
    this.rooms.set(code, room);

    const player = this.addPlayer(room, nickname, makeToken(), socket.id, true);
    room.hostId = player.id;

    socket.join(code);
    socket.data.roomCode = code;
    socket.data.playerId = player.id;
    socket.data.token = player.token;

    this.emitState(room);
    ack({ ok: true, data: this.serializeSession(room, player) });
  }

  private joinRoom(
    socket: ManagerSocket,
    payload: { roomCode: string; nickname: string; token?: string },
    ack: (response: ActionAck<SessionPayload>) => void
  ) {
    const code = normalizeRoomCode(payload.roomCode);
    const room = this.rooms.get(code);
    if (!room) {
      ack({ ok: false, error: "Room not found." });
      return;
    }

    const nickname = normalizeNickname(payload.nickname);
    if (nickname.length < 2) {
      ack({ ok: false, error: "Nickname must be at least 2 characters long." });
      return;
    }

    const token = payload.token?.trim() || makeToken();
    const currentPlayer = [...room.players.values()].find((player) => player.token === token);
    const duplicateNickname = [...room.players.values()].some(
      (player) => player.nickname.toLowerCase() === nickname.toLowerCase() && player.token !== token
    );

    if (duplicateNickname) {
      ack({ ok: false, error: "That nickname is already taken in this room." });
      return;
    }

    if (room.phase !== "lobby" && !currentPlayer) {
      ack({ ok: false, error: "This room is already in progress. Wait for the next lobby." });
      return;
    }

    if (room.players.size >= MAX_PLAYERS && !currentPlayer) {
      ack({ ok: false, error: "Room is full." });
      return;
    }

    const previousSocketId = currentPlayer?.socketId ?? null;
    const isReconnect = Boolean(currentPlayer);
    const player =
      currentPlayer ??
      this.addPlayer(room, nickname, token, socket.id, false);

    if (currentPlayer) {
      currentPlayer.connected = true;
      currentPlayer.socketId = socket.id;
      currentPlayer.nickname = nickname;
      currentPlayer.ready = room.phase === "lobby" ? currentPlayer.ready : false;
      currentPlayer.joinedAt = Date.now();
    }

    if (previousSocketId && previousSocketId !== socket.id) {
      const oldSocket = this.io.sockets.sockets.get(previousSocketId);
      oldSocket?.disconnect(true);
    }

    socket.join(code);
    socket.data.roomCode = code;
    socket.data.playerId = player.id;
    socket.data.token = player.token;

    if (!room.hostId || !room.players.get(room.hostId)?.connected) {
      this.assignNewHost(room);
    }

    this.emitState(room);
    if (!isReconnect) {
      this.broadcastSystem(room, `${player.nickname} joined the room.`);
    }
    ack({ ok: true, data: this.serializeSession(room, player) });
  }

  private syncRoom(socket: ManagerSocket, ack: (response: ActionAck<SessionPayload>) => void) {
    const room = this.getRoomFromSocket(socket);
    const player = room ? this.getPlayerFromSocket(room, socket) : null;
    if (!room || !player) {
      ack({ ok: false, error: "No active room session." });
      return;
    }
    ack({ ok: true, data: this.serializeSession(room, player) });
  }

  private leaveRoom(socket: ManagerSocket) {
    const room = this.getRoomFromSocket(socket);
    const player = room ? this.getPlayerFromSocket(room, socket) : null;
    if (!room || !player) return;
    player.connected = false;
    player.socketId = null;
    player.ready = false;
    this.assignNewHost(room);
    this.emitState(room);
    this.broadcastSystem(room, `${player.nickname} left the room.`);
    this.scheduleCleanup(room);
  }

  private handleDisconnect(socket: ManagerSocket) {
    const room = this.getRoomFromSocket(socket);
    const player = room ? this.getPlayerFromSocket(room, socket) : null;
    if (!room || !player) return;
    player.connected = false;
    player.socketId = null;
    player.ready = false;
    this.assignNewHost(room);
    this.emitState(room);
    this.broadcastSystem(room, `${player.nickname} disconnected.`);
    this.scheduleCleanup(room);
  }

  private setReady(socket: ManagerSocket, ready: boolean) {
    const room = this.getRoomFromSocket(socket);
    const player = room ? this.getPlayerFromSocket(room, socket) : null;
    if (!room || !player) return;
    if (room.phase !== "lobby") return;
    player.ready = ready;
    this.emitState(room);
  }

  private startGame(socket: ManagerSocket) {
    const room = this.getRoomFromSocket(socket);
    const player = room ? this.getPlayerFromSocket(room, socket) : null;
    if (!room || !player) return;
    if (room.phase !== "lobby") return;
    if (player.id !== room.hostId) {
      socket.emit("room:error", "Only the host can start the game.");
      return;
    }

    const connectedPlayers = [...room.players.values()].filter((p) => p.connected);
    if (connectedPlayers.length < MIN_PLAYERS_TO_START) {
      socket.emit("room:error", `Need at least ${MIN_PLAYERS_TO_START} players to start.`);
      return;
    }

    if (!connectedPlayers.every((p) => p.ready || p.id === room.hostId)) {
      socket.emit("room:error", "Everyone must ready up before starting.");
      return;
    }

    this.beginRound(room);
  }

  private submitAnswer(socket: ManagerSocket, answer: string) {
    const room = this.getRoomFromSocket(socket);
    const player = room ? this.getPlayerFromSocket(room, socket) : null;
    if (!room || !player) return;
    if (room.phase !== "answering") return;
    if (player.answered) return;

    const clean = clampText(answer, MAX_ANSWER_LENGTH).trim();
    if (!clean) return;

    player.answer = clean;
    player.answered = true;
    this.emitState(room);

    if (this.connectedPlayers(room).every((p) => p.answered)) {
      this.startReveal(room);
    }
  }

  private claimImposter(socket: ManagerSocket) {
    const room = this.getRoomFromSocket(socket);
    const player = room ? this.getPlayerFromSocket(room, socket) : null;
    if (!room || !player) return;
    if (!["prompt", "answering", "discussion"].includes(room.phase)) return;
    player.claimedImposter = true;
    this.emitState(room);
  }

  private sendChat(socket: ManagerSocket, text: string) {
    const room = this.getRoomFromSocket(socket);
    const player = room ? this.getPlayerFromSocket(room, socket) : null;
    if (!room || !player) return;
    if (!["reveal", "discussion", "voting", "results"].includes(room.phase)) return;

    const clean = clampText(text, MAX_CHAT_LENGTH);
    if (!clean) return;

    const message: ChatMessage = {
      id: randomUUID(),
      roomCode: room.code,
      playerId: player.id,
      nickname: player.nickname,
      text: clean,
      createdAt: Date.now()
    };
    room.chat = [...room.chat, message].slice(-80);
    this.io.to(room.code).emit("chat:new", message);
    this.emitState(room);
  }

  private castVote(socket: ManagerSocket, targetId: string) {
    const room = this.getRoomFromSocket(socket);
    const player = room ? this.getPlayerFromSocket(room, socket) : null;
    if (!room || !player) return;
    if (room.phase !== "voting") return;
    if (player.voted || player.voteTargetId) return;
    if (targetId === player.id) {
      socket.emit("room:error", "You cannot vote for yourself.");
      return;
    }

    const target = room.players.get(targetId);
    if (!target) {
      socket.emit("room:error", "That player is not in this room.");
      return;
    }

    player.voteTargetId = targetId;
    player.voted = true;
    this.emitState(room);

    if (this.connectedPlayers(room).every((p) => p.voted)) {
      this.finishVoting(room);
    }
  }

  private beginRound(room: RoomRuntime) {
    this.clearTimers(room);
    room.round += 1;
    room.chat = [...room.chat, this.makeSystemMessage(room.code, `Round ${room.round} begins.`)];
    room.currentPrompt = shuffle(PROMPT_PAIRS)[0];
    room.anonymousAnswers = [];
    room.imposterId = null;
    room.phase = "prompt";
    room.phaseEndsAt = nowPlus(PROMPT_SECONDS);

    const connectedPlayers = this.connectedPlayers(room);
    const imposter = pickRandom(connectedPlayers);
    room.imposterId = imposter.id;

    for (const player of room.players.values()) {
      player.answer = null;
      player.voteTargetId = null;
      player.answered = false;
      player.voted = false;
      player.claimedImposter = false;
      player.ready = false;
      player.isImposter = player.id === imposter.id;
    }

    this.emitState(room);

    for (const player of connectedPlayers) {
      const socket = this.socketForPlayer(player.socketId);
      if (!socket) continue;
      const privatePrompt: PrivatePromptPayload = {
        round: room.round,
        prompt: player.isImposter ? room.currentPrompt.fakePrompt : room.currentPrompt.realPrompt,
        isImposter: player.isImposter,
        phaseEndsAt: room.phaseEndsAt
      };
      socket.emit("game:private-prompt", privatePrompt);
    }

    room.timers.prompt = setTimeout(() => {
      this.startAnswering(room);
    }, PROMPT_SECONDS * 1000);
  }

  private startAnswering(room: RoomRuntime) {
    if (room.phase !== "prompt") return;
    room.phase = "answering";
    room.phaseEndsAt = nowPlus(ANSWER_SECONDS);
    this.broadcastSystem(room, "Answer phase started.");
    this.emitState(room);

    room.timers.answer = setTimeout(() => {
      this.startReveal(room);
    }, ANSWER_SECONDS * 1000);
  }

  private startReveal(room: RoomRuntime) {
    if (!["prompt", "answering"].includes(room.phase)) return;
    this.clearTimer(room.timers.answer);
    this.clearTimer(room.timers.prompt);
    room.phase = "reveal";
    room.phaseEndsAt = nowPlus(REVEAL_SECONDS);
    room.anonymousAnswers = shuffle(
      [...room.players.values()]
        .filter((player) => Boolean(player.answer))
        .map((player) => player.answer as string)
    );

    const payload: RevealAnswersPayload = {
      round: room.round,
      answers: room.anonymousAnswers
    };

    this.broadcastSystem(room, "Answers are being revealed anonymously.");
    this.emitState(room);
    this.io.to(room.code).emit("game:reveal-answers", payload);

    room.timers.reveal = setTimeout(() => {
      this.startDiscussion(room);
    }, REVEAL_SECONDS * 1000);
  }

  private startDiscussion(room: RoomRuntime) {
    if (room.phase !== "reveal") return;
    this.clearTimer(room.timers.reveal);
    room.phase = "discussion";
    room.phaseEndsAt = nowPlus(DISCUSSION_SECONDS);
    this.broadcastSystem(room, "Discussion time.");
    this.emitState(room);

    room.timers.discussion = setTimeout(() => {
      this.startVoting(room);
    }, DISCUSSION_SECONDS * 1000);
  }

  private startVoting(room: RoomRuntime) {
    if (room.phase !== "discussion") return;
    this.clearTimer(room.timers.discussion);
    room.phase = "voting";
    room.phaseEndsAt = nowPlus(VOTING_SECONDS);

    for (const player of room.players.values()) {
      player.voteTargetId = null;
      player.voted = false;
    }

    this.broadcastSystem(room, "Voting time.");
    this.emitState(room);

    room.timers.voting = setTimeout(() => {
      this.finishVoting(room);
    }, VOTING_SECONDS * 1000);
  }

  private finishVoting(room: RoomRuntime) {
    if (room.phase !== "voting") return;
    this.clearTimer(room.timers.voting);

    const imposter = room.imposterId ? room.players.get(room.imposterId) : null;
    if (!imposter) {
      this.resetToLobby(room);
      return;
    }

    const votes = [...room.players.values()]
      .filter((player) => player.voted && player.voteTargetId)
      .map((player) => ({
        playerId: player.id,
        playerNickname: player.nickname,
        targetId: player.voteTargetId as string,
        targetNickname: room.players.get(player.voteTargetId as string)?.nickname ?? null
      }));

    const tally = new Map<string, number>();
    for (const vote of votes) {
      tally.set(vote.targetId, (tally.get(vote.targetId) ?? 0) + 1);
    }

    const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    const caught = Boolean(top && top[0] === imposter.id && top[1] > 0);

    const scoreChanges: ScoreDelta[] = [];
    for (const player of room.players.values()) {
      if (player.voteTargetId === imposter.id) {
        player.score += 2;
        scoreChanges.push({
          playerId: player.id,
          nickname: player.nickname,
          delta: 2,
          reason: "Correct vote: +2"
        });
      }
    }

    if (!caught) {
      imposter.score += 4;
      scoreChanges.push({
        playerId: imposter.id,
        nickname: imposter.nickname,
        delta: 4,
        reason: "Imposter slipped through: +4"
      });
    }

    if (imposter.claimedImposter) {
      imposter.score += 1;
      scoreChanges.push({
        playerId: imposter.id,
        nickname: imposter.nickname,
        delta: 1,
        reason: "Imposter guessed themselves: +1"
      });
    }

    const scoreboard = [...room.players.values()]
      .map((player) => ({
        playerId: player.id,
        nickname: player.nickname,
        score: player.score
      }))
      .sort((a, b) => b.score - a.score);

    const historyEntry: RoundHistoryEntry = {
      round: room.round,
      realPrompt: room.currentPrompt?.realPrompt ?? "",
      fakePrompt: room.currentPrompt?.fakePrompt ?? "",
      imposterId: imposter.id,
      imposterNickname: imposter.nickname,
      caught,
      correctVotes: votes.filter((vote) => vote.targetId === imposter.id).length,
      scoreChanges,
      createdAt: Date.now()
    };
    room.history = [historyEntry, ...room.history].slice(0, 20);

    const payload: ResultsPayload = {
      round: room.round,
      imposterId: imposter.id,
      imposterNickname: imposter.nickname,
      realPrompt: room.currentPrompt?.realPrompt ?? "",
      fakePrompt: room.currentPrompt?.fakePrompt ?? "",
      caught,
      votes,
      scoreChanges,
      scoreboard
    };

    room.phase = "results";
    room.phaseEndsAt = nowPlus(RESULTS_SECONDS);
    this.broadcastSystem(room, caught ? `${imposter.nickname} was caught.` : `${imposter.nickname} survived the vote.`);
    this.emitState(room);
    this.io.to(room.code).emit("game:results", payload);
    this.io.to(room.code).emit("game:eject", { playerId: imposter.id, nickname: imposter.nickname });

    room.timers.reveal = undefined;
    room.timers.discussion = undefined;
    room.timers.voting = undefined;

    room.timers.cleanup = setTimeout(() => {
      const connectedCount = this.connectedPlayers(room).length;
      if (connectedCount >= MIN_PLAYERS_TO_START) {
        this.beginRound(room);
      } else {
        this.resetToLobby(room);
      }
    }, RESULTS_SECONDS * 1000);
  }

  private resetToLobby(room: RoomRuntime) {
    this.clearTimers(room);
    room.phase = "lobby";
    room.phaseEndsAt = null;
    room.currentPrompt = null;
    room.imposterId = null;
    room.anonymousAnswers = [];
    for (const player of room.players.values()) {
      player.ready = false;
      player.answered = false;
      player.voted = false;
      player.voteTargetId = null;
      player.answer = null;
      player.claimedImposter = false;
      player.isImposter = false;
    }
    this.assignNewHost(room);
    this.broadcastSystem(room, "Back to the lobby.");
    this.emitState(room);
  }

  private addPlayer(room: RoomRuntime, nickname: string, token: string, socketId: string, connected: boolean) {
    const player: PlayerRuntime = {
      id: randomUUID(),
      nickname,
      score: 0,
      connected,
      ready: false,
      isHost: false,
      answered: false,
      voted: false,
      claimedImposter: false,
      token,
      socketId,
      answer: null,
      voteTargetId: null,
      isImposter: false,
      joinedAt: Date.now()
    };
    room.players.set(player.id, player);
    return player;
  }

  private connectedPlayers(room: RoomRuntime) {
    return [...room.players.values()].filter((player) => player.connected);
  }

  private assignNewHost(room: RoomRuntime) {
    const currentHost = room.players.get(room.hostId);
    if (currentHost?.connected) {
      return;
    }

    const nextHost = [...room.players.values()].find((player) => player.connected) ?? [...room.players.values()][0];
    if (nextHost) {
      room.hostId = nextHost.id;
    }
  }

  private getRoomFromSocket(socket: ManagerSocket) {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return null;
    return this.rooms.get(roomCode) ?? null;
  }

  private getPlayerFromSocket(room: RoomRuntime, socket: ManagerSocket) {
    return [...room.players.values()].find((player) => player.id === socket.data.playerId) ?? null;
  }

  private serializeRoom(room: RoomRuntime): RoomSnapshot {
    return {
      code: room.code,
      phase: room.phase,
      round: room.round,
      maxPlayers: room.maxPlayers,
      hostId: room.hostId,
      phaseEndsAt: room.phaseEndsAt,
      players: [...room.players.values()].map((player) => ({
        id: player.id,
        nickname: player.nickname,
        score: player.score,
        connected: player.connected,
        ready: player.ready,
        isHost: player.id === room.hostId,
        answered: player.answered,
        voted: player.voted,
        claimedImposter: player.claimedImposter
      })),
      chat: room.chat,
      history: room.history
    };
  }

  private serializeSession(room: RoomRuntime, player: PlayerRuntime): SessionPayload {
    return {
      room: this.serializeRoom(room),
      player: {
        id: player.id,
        nickname: player.nickname,
        score: player.score,
        connected: player.connected,
        ready: player.ready,
        isHost: player.id === room.hostId,
        answered: player.answered,
        voted: player.voted,
        claimedImposter: player.claimedImposter
      },
      token: player.token
    };
  }

  private emitState(room: RoomRuntime) {
    this.ensureHost(room);
    this.io.to(room.code).emit("room:state", this.serializeRoom(room));
  }

  private ensureHost(room: RoomRuntime) {
    const host = room.players.get(room.hostId);
    if (host?.connected) {
      for (const player of room.players.values()) {
        player.isHost = player.id === room.hostId;
      }
      return;
    }

    this.assignNewHost(room);
    for (const player of room.players.values()) {
      player.isHost = player.id === room.hostId;
    }
  }

  private broadcastSystem(room: RoomRuntime, text: string) {
    const message = this.makeSystemMessage(room.code, text);
    room.chat = [...room.chat, message].slice(-80);
    this.io.to(room.code).emit("chat:new", message);
  }

  private makeSystemMessage(roomCode: string, text: string): ChatMessage {
    return {
      id: randomUUID(),
      roomCode,
      playerId: "system",
      nickname: "System",
      text,
      system: true,
      createdAt: Date.now()
    };
  }

  private socketForPlayer(socketId: string | null) {
    if (!socketId) return null;
    return this.io.sockets.sockets.get(socketId) ?? null;
  }

  private clearTimer(timer?: NodeJS.Timeout) {
    if (timer) clearTimeout(timer);
  }

  private clearTimers(room: RoomRuntime) {
    this.clearTimer(room.timers.prompt);
    this.clearTimer(room.timers.answer);
    this.clearTimer(room.timers.reveal);
    this.clearTimer(room.timers.discussion);
    this.clearTimer(room.timers.voting);
    this.clearTimer(room.timers.cleanup);
    room.timers = {};
  }

  private scheduleCleanup(room: RoomRuntime) {
    this.clearTimer(room.timers.cleanup);
    room.timers.cleanup = setTimeout(() => {
      const connected = this.connectedPlayers(room).length;
      if (connected === 0) {
        this.rooms.delete(room.code);
      }
    }, 1000 * 60 * 15);
  }
}
