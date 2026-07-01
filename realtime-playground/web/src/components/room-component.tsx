"use client";

import { LiveKitRoom, RoomAudioRenderer, StartAudio } from "@livekit/components-react";
import { Transcript } from "@/components/transcript";
import { useConnection } from "@/hooks/use-connection";
import { AgentProvider } from "@/hooks/use-agent";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, User as UserIcon } from "lucide-react";
import AgentAvatar from "@/components/agent-video";
function UserTile() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-6 gap-3">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-200 text-neutral-700">
        <UserIcon className="h-8 w-8" />
      </div>
      <div className="text-xs font-medium text-neutral-700">You</div>
    </div>
  );
}

export function RoomComponent() {
  const { shouldConnect, wsUrl, token } = useConnection();
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const scrollButtonRef = useRef<HTMLButtonElement>(null);
  const [showGreeting, setShowGreeting] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => setShowGreeting(false), 5000);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <LiveKitRoom
      serverUrl={wsUrl}
      token={token}
      connect={shouldConnect}
      audio
      className="flex flex-col flex-grow overflow-hidden border-l border-r border-b rounded-b-md"
      style={{ "--lk-bg": "white" } as React.CSSProperties}
      options={{
        publishDefaults: { stopMicTrackOnMute: true },
      }}
    >
      <AgentProvider>
        <div className="relative flex flex-col gap-4 p-4 h-full overflow-hidden">
          {showGreeting && (
            <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
              <div className="pointer-events-auto rounded-full bg-black text-white text-xs md:text-sm px-4 py-2 shadow-lg animate-fade-out">
                Say hello to get started.
              </div>
            </div>
          )}

          {/* Top: transcription area */}
          <div className="flex-1 min-h-[160px] rounded-xl bg-white border border-neutral-200 shadow-sm flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-100 text-xs font-medium text-neutral-500">
              <span>Live transcription</span>
              <button
                ref={scrollButtonRef}
                className="inline-flex items-center rounded-full bg-neutral-50 px-2 py-1 text-[10px] md:text-xs text-neutral-600 hover:bg-neutral-100 border border-neutral-200"
              >
                <ChevronDown className="mr-1 h-3 w-3" />
                View latest
              </button>
            </div>
            <div
              ref={transcriptContainerRef}
              className="flex-1 overflow-y-auto px-4 pb-4 pt-2"
            >
              <Transcript
                scrollContainerRef={transcriptContainerRef}
                scrollButtonRef={scrollButtonRef}
              />
            </div>
          </div>

          {/* Bottom: Agent and You boxes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl bg-white border border-neutral-200 shadow-sm p-4 flex flex-col gap-2">
              <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Alex</div>
              <AgentAvatar />
            </div>
            <div className="rounded-xl bg-white border border-neutral-200 shadow-sm p-4 flex flex-col gap-4">
              <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">You</div>
              <UserTile />
            </div>
          </div>
        </div>
        <RoomAudioRenderer />
        <StartAudio label="Click to allow audio playback" />
      </AgentProvider>
    </LiveKitRoom>
  );
}
