"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { useMultibandTrackVolume } from "@/hooks/use-multiband-track-volume";

type AgentAvatarProps = {
  className?: string;
};

export default function AgentAvatar({ className }: AgentAvatarProps) {
  const tracks = useTracks();

  const agentAudioTrack = useMemo(() => {
    const agentAudios = tracks.filter(
      (t) => t.publication?.kind === Track.Kind.Audio && (t.participant as any)?.isAgent,
    );
    return agentAudios[0]?.publication?.track as Track | undefined;
  }, [tracks]);

  const bands = useMultibandTrackVolume(agentAudioTrack);
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    if (!bands || bands.length === 0) {
      setIsSpeaking(false);
      return;
    }

    const avg =
      bands
        .map((band) => band.reduce((sum, v) => sum + v, 0) / Math.max(band.length, 1))
        .reduce((sum, v) => sum + v, 0) / Math.max(bands.length, 1);

    setIsSpeaking(avg > 0.15);
  }, [bands]);

  return (
    <div
      className={
        "relative flex items-center justify-center rounded-xl bg-white shadow-md border border-neutral-200 p-4 " +
        (className ?? "")
      }
    >
      <div
        className={
          "relative flex h-20 w-20 items-center justify-center rounded-full bg-neutral-100 transition-all duration-300 " +
          (isSpeaking ? "ring-4 ring-sky-400 shadow-lg scale-105" : "ring-0")
        }
      >
        <Image
          src="/avatar.png"
          alt="Alex, AI Agent Avatar"
          fill
          sizes="80px"
          className="rounded-full object-cover"
        />
      </div>
    </div>
  );
}
