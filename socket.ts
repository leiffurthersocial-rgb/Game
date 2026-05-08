"use client";

import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@/shared/game-types";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket() {
  if (!socket) {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL;
    if (!url) {
      throw new Error("NEXT_PUBLIC_SOCKET_URL is not set");
    }

    socket = io(url, {
      autoConnect: false,
      transports: ["websocket", "polling"],
      withCredentials: false
    });
  }

  return socket;
}
