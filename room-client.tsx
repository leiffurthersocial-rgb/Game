"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Copy,
  Crown,
  Ghost,
  MessageSquareText,
  ShieldAlert,
  Sparkles,
  Vote
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Avatar } from "@/components/ui/avatar";
import { getSocket } from "@/lib/socket";
import { clampText, formatTime, normalizeNickname, shuffle } from "@/lib/utils";
import { useCountdown } from "@/hooks/use-countdown";
import { readSessionStorage, writeSessionStorage } from "@/lib/storage";
import { MAX_ANSWER_LENGTH, MAX_CHAT_LENGTH, MIN_PLAYERS_TO_START, MAX_PLAYERS } from "@/lib/constants";
import { useGameStore } from "@/store/game-store";
import type {
  ChatMessage,
  PrivatePromptPayload,
  ResultsPayload,
  RevealAnswersPayload,
  RoomSnapshot,
  SessionPayload
} from "@/shared/game-types";

function useRoomSocket(roomCode: string) {
  const setConnection = useGameStore((state) => state.setConnection);
  const setError = useGameStore((state) => state.setError);
  const setRoom = useGameStore((state) => state.setRoom);
  const setSession = useGameStore((state) => state.setSession);
  const setPrivatePrompt = useGameStore((state) => state.setPrivatePrompt);
  const setRevealAnswers = useGameStore((state) => state.setRevealAnswers);
  const setResults = useGameStore((state) => state.setResults);
  const addChatMessage = useGameStore((state) => state.addChatMessage);
  const clearRoundUi = useGameStore((state) => state.clearRoundUi);

  React.useEffect(() => {
    const socket = getSocket();

    const onRoomState = (snapshot: RoomSnapshot) => {
      setRoom(snapshot);
      setConnection("connected");
      setError(null);

      const session = readSessionStorage();
      if (session) {
        const me = snapshot.players.find((player) => player.id === session.playerId);
        if (me) {
          const nextSession: SessionPayload = {
            room: snapshot,
            player: me,
            token: session.token
          };
          setSession(nextSession);
          writeSessionStorage({
            ...session,
            roomCode: snapshot.code,
            playerId: me.id,
            nickname: me.nickname
          });
        }
      }

      if (snapshot.phase === "lobby") {
        clearRoundUi();
      }
    };

    const onError = (message: string) => {
      setConnection("error");
      setError(message);
      toast.error(message);
    };

    const onChat = (message: ChatMessage) => {
      addChatMessage(message);
    };

    const onPrivatePrompt = (payload: PrivatePromptPayload) => {
      setPrivatePrompt(payload);
    };

    const onRevealAnswers = (payload: RevealAnswersPayload) => {
      setRevealAnswers(payload);
    };

    const onResults = (payload: ResultsPayload) => {
      setResults(payload);
    };

    socket.on("room:state", onRoomState);
    socket.on("room:error", onError);
    socket.on("chat:new", onChat);
    socket.on("game:private-prompt", onPrivatePrompt);
    socket.on("game:reveal-answers", onRevealAnswers);
    socket.on("game:results", onResults);
    socket.on("game:eject", ({ nickname }) => {
      toast.message(`${nickname} was ejected.`);
    });

    if (!socket.connected) {
      setConnection("connecting");
      socket.connect();
    }

    const stored = readSessionStorage();
    if (stored?.nickname) {
      socket.emit(
        "room:join",
        {
          roomCode,
          nickname: stored.nickname,
          token: stored.token
        },
        (response) => {
          if (!response.ok) {
            setError(response.error);
            setConnection("error");
            return;
          }
          setSession(response.data);
          setRoom(response.data.room);
          setConnection("connected");
        }
      );
    }

    return () => {
      socket.off("room:state", onRoomState);
      socket.off("room:error", onError);
      socket.off("chat:new", onChat);
      socket.off("game:private-prompt", onPrivatePrompt);
      socket.off("game:reveal-answers", onRevealAnswers);
      socket.off("game:results", onResults);
    };
  }, [addChatMessage, clearRoundUi, roomCode, setConnection, setError, setPrivatePrompt, setRevealAnswers, setResults, setRoom, setSession]);
}

function useRevealRotation(payload: RevealAnswersPayload | null) {
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    setIndex(0);
  }, [payload?.round]);

  React.useEffect(() => {
    if (!payload?.answers?.length) return;
    const id = window.setInterval(() => {
      setIndex((current) => Math.min(current + 1, payload.answers.length - 1));
    }, 1700);
    return () => window.clearInterval(id);
  }, [payload?.answers]);

  return index;
}

function CountdownPill({ endAt }: { endAt: number | null }) {
  const { secondsLeft, progress, urgent } = useCountdown(endAt);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-white/60">
        <span className="flex items-center gap-2">
          <Clock3 className="h-3.5 w-3.5" />
          Timer
        </span>
        <span className={urgent ? "text-red-300" : "text-white"}>{formatTime(secondsLeft)}</span>
      </div>
      <Progress value={progress} className={urgent ? "bg-red-500/15" : undefined} />
    </div>
  );
}

function PlayerBadge({ name, score, me, host }: { name: string; score: number; me?: boolean; host?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
      <div className="flex items-center gap-3">
        <Avatar name={name} />
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white">{name}</span>
            {host ? <Crown className="h-3.5 w-3.5 text-yellow-300" /> : null}
            {me ? <Badge variant="accent">You</Badge> : null}
          </div>
          <div className="text-xs text-white/45">Score {score}</div>
        </div>
      </div>
      <Badge variant="secondary">{score}</Badge>
    </div>
  );
}

function ChatPanel({ roomCode }: { roomCode: string }) {
  const chat = useGameStore((state) => state.room?.chat ?? []);
  const chatDraft = useGameStore((state) => state.chatDraft);
  const setChatDraft = useGameStore((state) => state.setChatDraft);

  const socket = getSocket();
  const listRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.length]);

  function send() {
    const text = clampText(chatDraft, MAX_CHAT_LENGTH);
    if (!text) return;
    socket.emit("chat:send", { text });
    setChatDraft("");
  }

  return (
    <Card className="flex h-full min-h-[320px] flex-col">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <MessageSquareText className="h-4 w-4" />
          Chat
        </CardTitle>
        <CardDescription>Text-only, private to the room.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto pr-1">
          {chat.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-white/40">
              No messages yet. Start the discussion.
            </div>
          ) : (
            chat.map((message) => (
              <div
                key={message.id}
                className={message.system ? "rounded-2xl bg-white/5 px-3 py-2 text-sm text-white/70" : "rounded-2xl border border-white/10 bg-black/20 px-3 py-2"}
              >
                <div className="mb-1 flex items-center justify-between text-[11px] text-white/40">
                  <span>{message.system ? "System" : message.nickname}</span>
                  <span>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <p className="text-sm leading-6 text-white">{message.text}</p>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <Input
            value={chatDraft}
            onChange={(event) => setChatDraft(clampText(event.target.value, MAX_CHAT_LENGTH))}
            placeholder={roomCode ? `Message ${roomCode}` : "Message the room"}
            maxLength={MAX_CHAT_LENGTH}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
          />
          <Button onClick={send} className="shrink-0">
            Send
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function LobbyScreen({ room, me, isHost }: { room: RoomSnapshot; me: RoomSnapshot["players"][number] | undefined; isHost: boolean }) {
  const socket = getSocket();
  const ready = me?.ready ?? false;
  const connectedCount = room.players.filter((player) => player.connected).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Badge variant="secondary">Lobby</Badge>
          <span>Room {room.code}</span>
        </CardTitle>
        <CardDescription>{room.players.length}/{MAX_PLAYERS} players</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {room.players.map((player) => (
            <div key={player.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white">{player.nickname}</span>
                  {player.isHost ? <Crown className="h-4 w-4 text-yellow-300" /> : null}
                </div>
                <div className="text-xs text-white/45">{player.connected ? "Connected" : "Disconnected"}</div>
              </div>
              <Badge variant={player.ready ? "accent" : "outline"}>{player.ready ? "Ready" : "Not ready"}</Badge>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant={ready ? "outline" : "default"}
            className="flex-1"
            onClick={() => socket.emit("room:ready", { ready: !ready })}
            disabled={!me}
          >
            {ready ? "Unready" : "Ready up"}
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            disabled={!isHost || connectedCount < MIN_PLAYERS_TO_START}
            onClick={() => socket.emit("game:start")}
          >
            Start game
          </Button>
        </div>

        {!isHost ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">
            Only the host can start the game.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PromptScreen({
  room,
  me,
  privatePrompt
}: {
  room: RoomSnapshot;
  me: RoomSnapshot["players"][number] | undefined;
  privatePrompt: PrivatePromptPayload | null;
}) {
  const socket = getSocket();
  const [answer, setAnswer] = React.useState("");
  const hasPrompt = Boolean(privatePrompt);
  const isAnswered = me?.answered ?? false;
  const { secondsLeft, urgent } = useCountdown(privatePrompt?.phaseEndsAt ?? room.phaseEndsAt);

  React.useEffect(() => {
    setAnswer("");
  }, [privatePrompt?.round]);

  function submitAnswer() {
    const text = clampText(answer, MAX_ANSWER_LENGTH);
    if (!text) return;
    socket.emit("game:answer", { answer: text });
    setAnswer("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          {room.phase === "prompt" ? "Prompt incoming" : "Answer in private"}
        </CardTitle>
        <CardDescription>
          {room.phase === "prompt"
            ? "Keep this prompt to yourself."
            : "Short answers work best. The room will move on when everyone answers."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <CountdownPill endAt={privatePrompt?.phaseEndsAt ?? room.phaseEndsAt} />

        <motion.div
          key={`${privatePrompt?.round ?? "none"}-${privatePrompt?.prompt ?? "empty"}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-5"
        >
          <div className="text-xs uppercase tracking-[0.2em] text-white/45">Your prompt</div>
          <div className="mt-3 text-xl font-semibold leading-8 text-white">
            {hasPrompt ? privatePrompt.prompt : "Waiting for prompt..."}
          </div>
          <div className="mt-3 text-sm text-white/50">
            {privatePrompt?.isImposter ? (
              <span className="inline-flex items-center gap-2 text-amber-300">
                <ShieldAlert className="h-4 w-4" />
                You received the alternate prompt.
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                You received the real prompt.
              </span>
            )}
          </div>
        </motion.div>

        {room.phase === "answering" ? (
          <div className="space-y-3">
            <Textarea
              value={answer}
              onChange={(event) => setAnswer(clampText(event.target.value, MAX_ANSWER_LENGTH))}
              placeholder="Write a short answer..."
              maxLength={MAX_ANSWER_LENGTH}
            />
            <div className="flex items-center justify-between text-xs text-white/45">
              <span>{answer.length}/{MAX_ANSWER_LENGTH}</span>
              <span>{isAnswered ? "Answer submitted" : "Still writing..."}</span>
            </div>
            <Button className="w-full" onClick={submitAnswer} disabled={isAnswered || answer.trim().length === 0}>
              Submit answer
            </Button>
            <Button variant="outline" className="w-full" onClick={() => socket.emit("imposter:claim")} disabled={room.phase !== "answering" && room.phase !== "discussion" && room.phase !== "prompt"}>
              I think I am the imposter
            </Button>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">
            Wait for the answer phase. Your prompt stays private.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RevealScreen({ room, revealAnswers }: { room: RoomSnapshot; revealAnswers: RevealAnswersPayload | null }) {
  const index = useRevealRotation(revealAnswers);
  const answers = revealAnswers?.answers ?? [];
  const currentAnswer = answers[index];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ghost className="h-4 w-4" />
          Anonymous answers
        </CardTitle>
        <CardDescription>One answer at a time, then the room starts discussing.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <CountdownPill endAt={room.phaseEndsAt} />
        <AnimatePresence mode="wait">
          <motion.div
            key={`${room.round}-${index}-${currentAnswer}`}
            initial={{ opacity: 0, y: 12, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -12, filter: "blur(8px)" }}
            className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-6 text-center"
          >
            <div className="text-xs uppercase tracking-[0.2em] text-white/45">
              Answer {Math.min(index + 1, Math.max(answers.length, 1))}/{Math.max(answers.length, 1)}
            </div>
            <div className="mt-3 text-2xl font-semibold leading-9 text-white">
              {currentAnswer ?? "Waiting for answers..."}
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center justify-center gap-2">
          {answers.map((_, dotIndex) => (
            <span
              key={dotIndex}
              className={`h-2.5 w-2.5 rounded-full ${dotIndex <= index ? "bg-white" : "bg-white/25"}`}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function VotingScreen({ room, me }: { room: RoomSnapshot; me: RoomSnapshot["players"][number] | undefined }) {
  const socket = getSocket();
  const localVote = useGameStore((state) => state.localVote);
  const setLocalVote = useGameStore((state) => state.setLocalVote);

  const candidates = room.players.filter((player) => player.id !== me?.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Vote className="h-4 w-4" />
          Vote for the imposter
        </CardTitle>
        <CardDescription>
          Vote once. Results stay hidden until the reveal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <CountdownPill endAt={room.phaseEndsAt} />
        <div className="grid gap-3 sm:grid-cols-2">
          {candidates.map((player) => {
            const selected = localVote === player.id;
            return (
              <button
                key={player.id}
                onClick={() => {
                  setLocalVote(player.id);
                  socket.emit("vote:cast", { targetId: player.id });
                }}
                className={`rounded-3xl border p-4 text-left transition ${selected ? "border-white bg-white/10" : "border-white/10 bg-black/20 hover:bg-white/5"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={player.nickname} />
                    <div>
                      <div className="font-medium text-white">{player.nickname}</div>
                      <div className="text-xs text-white/45">Tap to cast vote</div>
                    </div>
                  </div>
                  {selected ? <Badge variant="accent">Selected</Badge> : null}
                </div>
              </button>
            );
          })}
        </div>
        {me ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
            You cannot vote for yourself.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ResultsScreen({
  room,
  results
}: {
  room: RoomSnapshot;
  results: ResultsPayload | null;
}) {
  const scoreMap = new Map((results?.scoreboard ?? []).map((player) => [player.playerId, player.score]));
  const changes = results?.scoreChanges ?? [];
  const caught = results?.caught ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Round results
        </CardTitle>
        <CardDescription>
          {caught ? "The imposter got caught." : "The imposter slipped through this round."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-5"
        >
          <div className="text-xs uppercase tracking-[0.2em] text-white/45">Ejection</div>
          <div className="mt-2 text-3xl font-black tracking-tight text-white">
            {results?.imposterNickname ?? "Unknown"}
          </div>
          <div className="mt-1 text-sm text-white/60">was the imposter</div>
        </motion.div>

        <div className="grid gap-3 md:grid-cols-2">
          <Card className="bg-black/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Real prompt</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-white/80">{results?.realPrompt}</CardContent>
          </Card>
          <Card className="bg-black/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Fake prompt</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-white/80">{results?.fakePrompt}</CardContent>
          </Card>
        </div>

        <Card className="bg-black/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Score changes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {changes.map((change) => (
              <div key={`${change.playerId}-${change.reason}`} className="flex items-center justify-between rounded-2xl border border-white/10 px-4 py-3">
                <div>
                  <div className="font-medium text-white">{change.nickname}</div>
                  <div className="text-xs text-white/45">{change.reason}</div>
                </div>
                <Badge variant={change.delta >= 0 ? "accent" : "outline"}>{change.delta >= 0 ? "+" : ""}{change.delta}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-black/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Current scoreboard</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[...(results?.scoreboard ?? [])]
              .sort((a, b) => b.score - a.score)
              .map((player) => (
                <div key={player.playerId} className="flex items-center justify-between rounded-2xl border border-white/10 px-4 py-3">
                  <span className="font-medium text-white">{player.nickname}</span>
                  <span className="text-sm text-white/65">{scoreMap.get(player.playerId) ?? player.score}</span>
                </div>
              ))}
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
}

function Sidebar({ room, me }: { room: RoomSnapshot; me: RoomSnapshot["players"][number] | undefined }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-4 w-4" />
            Scoreboard
          </CardTitle>
          <CardDescription>Persistent for the whole session.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {[...room.players].sort((a, b) => b.score - a.score).map((player) => (
            <PlayerBadge
              key={player.id}
              name={player.nickname}
              score={player.score}
              me={player.id === me?.id}
              host={player.isHost}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Round history</CardTitle>
          <CardDescription>Latest rounds stay on screen for the session.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {room.history.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-white/40">
              No rounds yet.
            </div>
          ) : (
            room.history.slice(0, 4).map((entry) => (
              <div key={`${entry.round}-${entry.createdAt}`} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">
                <div className="flex items-center justify-between text-white">
                  <span>Round {entry.round}</span>
                  <Badge variant={entry.caught ? "accent" : "outline"}>{entry.caught ? "Caught" : "Escaped"}</Badge>
                </div>
                <div className="mt-2 text-white/60">{entry.imposterNickname}</div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Room code</CardTitle>
          <CardDescription>Share this code with your group.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-3xl border border-white/10 bg-black/30 px-4 py-5 text-center text-3xl font-black tracking-[0.4em] text-white">
            {room.code}
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={async () => {
              await navigator.clipboard.writeText(room.code);
              toast.success("Room code copied.");
            }}
          >
            <Copy className="h-4 w-4" />
            Copy code
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function JoinFallback({ roomCode, initialNickname = "" }: { roomCode: string; initialNickname?: string }) {
  const socket = getSocket();
  const setConnection = useGameStore((state) => state.setConnection);
  const setSession = useGameStore((state) => state.setSession);
  const [nickname, setNickname] = React.useState(initialNickname);

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Join room {roomCode}</CardTitle>
        <CardDescription>Enter a nickname to take your seat.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          value={nickname}
          onChange={(event) => setNickname(normalizeNickname(event.target.value))}
          placeholder="Nickname"
          maxLength={16}
        />
        <Button
          className="w-full"
          onClick={() => {
            const cleanNickname = normalizeNickname(nickname);
            if (cleanNickname.length < 2) {
              toast.error("Nickname needs at least 2 characters.");
              return;
            }
            if (!socket.connected) socket.connect();
            socket.emit("room:join", { roomCode, nickname: cleanNickname }, (response) => {
              if (!response.ok) {
                toast.error(response.error);
                setConnection("error");
                return;
              }
              writeSessionStorage({
                token: response.data.token,
                nickname: cleanNickname,
                roomCode,
                playerId: response.data.player.id
              });
              setSession(response.data);
              useGameStore.getState().setRoom(response.data.room);
              setConnection("connected");
            });
          }}
        >
          Join room
        </Button>
      </CardContent>
    </Card>
  );
}

export function RoomClient({ roomCode }: { roomCode: string }) {
  useRoomSocket(roomCode);

  const room = useGameStore((state) => state.room);
  const session = useGameStore((state) => state.session);
  const privatePrompt = useGameStore((state) => state.privatePrompt);
  const revealAnswers = useGameStore((state) => state.revealAnswers);
  const results = useGameStore((state) => state.results);
  const connection = useGameStore((state) => state.connection);
  const error = useGameStore((state) => state.error);
  const setChatDraft = useGameStore((state) => state.setChatDraft);

  const [revealKey, setRevealKey] = React.useState(0);

  React.useEffect(() => {
    setRevealKey((value) => value + 1);
  }, [revealAnswers?.round]);

  const me = room?.players.find((player) => player.id === session?.player.id);

  const endAt = room?.phaseEndsAt ?? null;
  const phaseTitle = {
    lobby: "Lobby",
    prompt: "Secret prompt",
    answering: "Answering",
    reveal: "Reveal",
    discussion: "Discussion",
    voting: "Voting",
    results: "Results"
  }[room?.phase ?? "lobby"];

  const phaseDetail = {
    lobby: "Get everyone in before the round starts.",
    prompt: "Prompt is private.",
    answering: "Send a short answer before time runs out.",
    reveal: "Anonymous answers are being shown one by one.",
    discussion: "Chat the room and build your case.",
    voting: "Choose the imposter.",
    results: "Scores are updating and the next round is loading."
  }[room?.phase ?? "lobby"];

  if (!room) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center p-4">
        <JoinFallback roomCode={roomCode} initialNickname={session?.player.nickname ?? ""} />
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl p-4 py-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Room {room.code}</Badge>
            <Badge variant="outline">{phaseTitle}</Badge>
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">Among Jose</h1>
          <p className="mt-1 text-sm text-white/55">{phaseDetail}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigator.clipboard.writeText(room.code)}>
            <Copy className="h-4 w-4" />
            Copy code
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_0.85fr]">
        <div className="space-y-4">
          {room.phase === "lobby" ? <LobbyScreen room={room} me={me} isHost={Boolean(me?.isHost)} /> : null}
          {room.phase === "prompt" || room.phase === "answering" ? <PromptScreen room={room} me={me} privatePrompt={privatePrompt} /> : null}
          {room.phase === "reveal" ? <RevealScreen key={revealKey} room={room} revealAnswers={revealAnswers} /> : null}
          {room.phase === "discussion" ? <Card><CardHeader><CardTitle>Discussion</CardTitle><CardDescription>Use the chat to argue your case.</CardDescription></CardHeader><CardContent className="space-y-4"><CountdownPill endAt={endAt} /><div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">Talk it out. The chat panel sits below.</div></CardContent></Card> : null}
          {room.phase === "voting" ? <VotingScreen room={room} me={me} /> : null}
          {room.phase === "results" ? <ResultsScreen room={room} results={results} /> : null}

          {(room.phase === "reveal" || room.phase === "discussion" || room.phase === "voting" || room.phase === "results") ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquareText className="h-4 w-4" />
                  Room chat
                </CardTitle>
                <CardDescription>Players can talk while the round unfolds.</CardDescription>
              </CardHeader>
              <CardContent>
                <ChatPanel roomCode={room.code} />
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Sidebar room={room} me={me} />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Session state
              </CardTitle>
              <CardDescription>Single live room state with reconnect support.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-white/65">
              <div>Connection: {connection}</div>
              <div>Round: {room.round}</div>
              <div>Players: {room.players.length}/{MAX_PLAYERS}</div>
              <div>Room phase: {room.phase}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Controls</CardTitle>
              <CardDescription>Clean, minimal, no extra clutter.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full" onClick={() => navigator.clipboard.writeText(room.code)}>
                Copy room code
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setChatDraft("")}>
                Clear chat draft
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <AnimatePresence>
        {room.phase === "results" && results ? (
          <motion.div
            key={`${room.round}-${results.imposterId}`}
            className="pointer-events-none fixed inset-0 z-40 grid place-items-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ y: 60, scale: 0.9, rotate: -2 }}
              animate={{ y: 0, scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 120, damping: 14 }}
              className="rounded-[2rem] border border-white/10 bg-black/80 px-8 py-6 text-center shadow-2xl backdrop-blur-xl"
            >
              <div className="text-xs uppercase tracking-[0.4em] text-white/45">Ejected</div>
              <div className="mt-3 text-4xl font-black text-white">{results.imposterNickname}</div>
              <div className="mt-2 text-sm text-white/60">The room has spoken.</div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
