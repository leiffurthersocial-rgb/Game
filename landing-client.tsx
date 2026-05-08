"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Dice6, DoorOpen, Users } from "lucide-react";
import { motion } from "framer-motion";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getSocket } from "@/lib/socket";
import { clampText, normalizeNickname, normalizeRoomCode } from "@/lib/utils";
import { readSessionStorage, writeSessionStorage } from "@/lib/storage";
import { useGameStore } from "@/store/game-store";
import type { SessionPayload } from "@/shared/game-types";

function useMount() {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return mounted;
}

function SessionResume() {
  const session = useGameStore((state) => state.session);
  const router = useRouter();

  if (!session) return null;

  return (
    <Card className="border-emerald-400/20 bg-emerald-400/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Badge variant="accent">Resume</Badge>
          <span>Room {session.room.code}</span>
        </CardTitle>
        <CardDescription>
          You were last in a live room. Jump back in fast.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          className="w-full"
          onClick={() => router.push(`/room/${session.room.code}`)}
        >
          Rejoin room
          <ArrowRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

export function LandingClient() {
  const router = useRouter();
  const mounted = useMount();
  const setSession = useGameStore((state) => state.setSession);
  const setConnection = useGameStore((state) => state.setConnection);
  const setError = useGameStore((state) => state.setError);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [joinOpen, setJoinOpen] = React.useState(false);
  const [nickname, setNickname] = React.useState("");
  const [roomCode, setRoomCode] = React.useState("");
  const [loading, setLoading] = React.useState<"create" | "join" | null>(null);

  React.useEffect(() => {
    if (!mounted) return;
    const existing = readSessionStorage();
    if (existing) {
      setSession({
        room: {
          code: existing.roomCode,
          phase: "lobby",
          round: 0,
          maxPlayers: 8,
          hostId: existing.playerId,
          phaseEndsAt: null,
          players: [],
          chat: [],
          history: []
        },
        player: {
          id: existing.playerId,
          nickname: existing.nickname,
          score: 0,
          connected: true,
          ready: false,
          isHost: true,
          answered: false,
          voted: false,
          claimedImposter: false
        },
        token: existing.token
      });
      setNickname(existing.nickname);
      setRoomCode(existing.roomCode);
    }
  }, [mounted, setSession]);

  async function submitCreate() {
    const cleanNickname = normalizeNickname(nickname);
    if (cleanNickname.length < 2) {
      setError("Nickname needs at least 2 characters.");
      return;
    }

    try {
      setLoading("create");
      setError(null);
      const socket = getSocket();
      if (!socket.connected) socket.connect();
      setConnection("connecting");

      socket.emit("room:create", { nickname: cleanNickname }, (response) => {
        setLoading(null);
        if (!response.ok) {
          setConnection("error");
          setError(response.error);
          return;
        }

        writeSessionStorage({
          token: response.data.token,
          nickname: cleanNickname,
          roomCode: response.data.room.code,
          playerId: response.data.player.id
        });

        setSession(response.data);
        setConnection("connected");
        router.push(`/room/${response.data.room.code}`);
      });
    } catch (error) {
      setLoading(null);
      setConnection("error");
      setError(error instanceof Error ? error.message : "Unable to connect.");
    }
  }

  async function submitJoin() {
    const cleanNickname = normalizeNickname(nickname);
    const cleanRoomCode = normalizeRoomCode(roomCode);

    if (cleanNickname.length < 2) {
      setError("Nickname needs at least 2 characters.");
      return;
    }
    if (cleanRoomCode.length !== 4) {
      setError("Room code must be 4 letters.");
      return;
    }

    try {
      setLoading("join");
      setError(null);
      const socket = getSocket();
      if (!socket.connected) socket.connect();
      setConnection("connecting");

      socket.emit(
        "room:join",
        { roomCode: cleanRoomCode, nickname: cleanNickname },
        (response) => {
          setLoading(null);
          if (!response.ok) {
            setConnection("error");
            setError(response.error);
            return;
          }

          writeSessionStorage({
            token: response.data.token,
            nickname: cleanNickname,
            roomCode: response.data.room.code,
            playerId: response.data.player.id
          });

          setSession(response.data);
          setConnection("connected");
          router.push(`/room/${response.data.room.code}`);
        }
      );
    } catch (error) {
      setLoading(null);
      setConnection("error");
      setError(error instanceof Error ? error.message : "Unable to connect.");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center gap-8 p-4 py-10 sm:p-6 lg:flex-row lg:items-center lg:gap-10">
      <section className="flex-1 space-y-6">
        <Badge variant="secondary" className="w-fit">
          Text-only social deduction
        </Badge>
        <div className="space-y-4">
          <h1 className="max-w-xl text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
            Among Jose
          </h1>
          <p className="max-w-xl text-base leading-7 text-white/65 sm:text-lg">
            A fast, mobile-first party game where one player gets a suspiciously related prompt and everyone else tries to expose them.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: Users, title: "Up to 8 players", text: "Private room codes and quick lobbies." },
            { icon: DoorOpen, title: "Fast rounds", text: "Automatic phase transitions keep games moving." },
            { icon: Dice6, title: "200+ prompts", text: "Funny, related prompt pairs for replayability." }
          ].map((item) => (
            <Card key={item.title} className="bg-white/4">
              <CardContent className="p-4">
                <item.icon className="mb-3 h-5 w-5 text-white/80" />
                <div className="text-sm font-semibold text-white">{item.title}</div>
                <div className="mt-1 text-sm leading-6 text-white/60">{item.text}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <Button size="lg" onClick={() => setCreateOpen(true)}>
            Create room
          </Button>
          <Button size="lg" variant="outline" onClick={() => setJoinOpen(true)}>
            Join with code
          </Button>
        </div>
      </section>

      <section className="w-full max-w-md space-y-4">
        <SessionResume />

        <Card>
          <CardHeader>
            <CardTitle>How it works</CardTitle>
            <CardDescription>One imposter, one fake prompt, one very suspicious conversation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-white/65">
            <div className="grid gap-3">
              <div>1. Create or join a private room.</div>
              <div>2. The imposter secretly gets a related prompt.</div>
              <div>3. Everyone answers, chats, votes, and scores update automatically.</div>
            </div>
            <Separator />
            <p>Designed for quick sessions on desktop or mobile, with a clean dark UI and zero voice chat friction.</p>
          </CardContent>
        </Card>
      </section>

      <Dialog open={createOpen} onOpenChange={setCreateOpen} title="Create room" description="Start a private room and get a 4-letter code.">
        <div className="space-y-4">
          <Input
            placeholder="Nickname"
            value={nickname}
            maxLength={16}
            onChange={(event) => setNickname(clampText(event.target.value, 16))}
          />
          <Button className="w-full" disabled={loading === "create"} onClick={submitCreate}>
            {loading === "create" ? "Creating..." : "Create private room"}
          </Button>
        </div>
      </Dialog>

      <Dialog open={joinOpen} onOpenChange={setJoinOpen} title="Join room" description="Enter a room code and nickname.">
        <div className="space-y-4">
          <Input
            placeholder="Room code"
            value={roomCode}
            maxLength={4}
            onChange={(event) => setRoomCode(normalizeRoomCode(event.target.value))}
            className="uppercase tracking-[0.3em]"
          />
          <Input
            placeholder="Nickname"
            value={nickname}
            maxLength={16}
            onChange={(event) => setNickname(clampText(event.target.value, 16))}
          />
          <Button className="w-full" disabled={loading === "join"} onClick={submitJoin}>
            {loading === "join" ? "Joining..." : "Join room"}
          </Button>
        </div>
      </Dialog>
    </main>
  );
}
