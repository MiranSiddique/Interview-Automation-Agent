import { defaultPresets } from "@/data/presets";
import { Metadata } from "next";
import { AgentControlPanel } from "@/components/agent-control-panel";
import { TranscriptsViewer } from "@/components/transcripts-viewer";
import { ConnectButton } from "@/components/connect-button";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}): Promise<Metadata> {
  let title = "Realtime Playground";
  let description =
    "Speech-to-speech playground for OpenAI's new Realtime API. Built on LiveKit Agents.";

  const presetId = searchParams?.preset;
  if (presetId) {
    const selectedPreset = defaultPresets.find(
      (preset) => preset.id === presetId,
    );
    if (selectedPreset) {
      title = `Realtime Playground`;
      description = `Speak to a "${selectedPreset.name}" in a speech-to-speech playground for OpenAI's new Realtime API. Built on LiveKitAgents.`;
    }
  }

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: "https://playground.livekit.io/",
      images: [
        {
          url: "https://playground.livekit.io/og-image.png",
          width: 1200,
          height: 675,
          type: "image/png",
          alt: title,
        },
      ],
    },
  };
}

export default function Dashboard() {
  return (
    <div className="flex flex-col h-full bg-neutral-100">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between p-3 w-full md:mx-auto">
        <div className="flex flex-col gap-3 w-full md:max-w-[380px]">
          <AgentControlPanel />
        </div>
        <div className="flex flex-col gap-3 w-full md:max-w-[420px]">
          <TranscriptsViewer />
          <div className="md:hidden">{/* mobile extra space */}</div>
        </div>
        <div className="flex flex-col gap-2 md:items-end w-full md:w-auto md:max-w-[240px]">
          <div className="text-xs font-semibold tracking-wider uppercase text-neutral-500">Session</div>
          <ConnectButton />
        </div>
      </header>
      <main className="flex flex-col flex-grow overflow-hidden p-0 md:p-2 md:pt-0 w-full md:mx-auto" />
      <footer className="hidden md:flex md:items-center md:gap-2 md:justify-end font-mono uppercase text-right pt-1 pb-2 px-8 text-xs text-gray-600 w-full md:mx-auto">
        Interview Agent • LiveKit
      </footer>
    </div>
  );
}
