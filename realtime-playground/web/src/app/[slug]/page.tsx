"use client";
/**
 * Dynamic room auto-connect page.
 * Usage: /roomName=<room_id>
 * - Auto fetches token & connects using provided room name.
 * - Displays only transcript (via RoomComponent) once connected
 * - Shows single Leave button to disconnect and go to /done
 * - No agent control, dispatch, or other playground controls
 */
import React, { useEffect, useState } from "react";
import { useRouter, notFound } from "next/navigation";
import { useConnection } from "@/hooks/use-connection";
import { RoomComponent } from "@/components/room-component";

export default function DirectRoomPage({ params }: { params: { slug: string } }) {
  const { slug } = params;
  if (!slug.startsWith("roomName=")) {
    notFound();
  }
  const roomName = decodeURIComponent(slug.slice("roomName=".length));
  const router = useRouter();
  const { connect, disconnect, shouldConnect, token } = useConnection();
  const [initiated, setInitiated] = useState(false);

  useEffect(() => {
    if (!initiated) {
      connect(roomName).catch(() => {/* swallow */}).finally(() => setInitiated(true));
    }
  }, [initiated, roomName, connect]);

  const handleLeave = async () => {
    try { await disconnect(); } catch {}
    router.replace("/done");
  };

  const connected = shouldConnect && !!token; // simplified indicator

  return (
    <main className="w-full h-dvh flex flex-col items-center justify-center gap-8 p-4">
      {!connected && (
        <div className="text-center space-y-2 animate-pulse">
          <p className="text-lg">Connecting to room <span className="font-mono">{roomName}</span>...</p>
          <p className="text-xs text-neutral-500">Please allow audio if prompted.</p>
        </div>
      )}
      <div className="w-full max-w-5xl flex-grow flex flex-col gap-6">
        <div className="flex-grow flex flex-col min-h-[300px]">
          <RoomComponent />
        </div>
        <div className="w-full flex items-center justify-center pb-6">
          <button
            onClick={handleLeave}
            className="px-8 py-3 rounded-md bg-red-600 hover:bg-red-500 text-white font-medium shadow transition"
          >
            Leave
          </button>
        </div>
      </div>
    </main>
  );
}
