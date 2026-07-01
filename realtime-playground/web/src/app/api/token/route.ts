import { AccessToken } from "livekit-server-sdk";

interface TokenRequest {
  roomName?: string;
  sessionConfig?: {
    voice?: string;
  };
}

export async function POST(request: Request) {
  let body: TokenRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const roomName =
    body.roomName ||
    "groq-ordering-" + Math.random().toString(36).slice(2, 8);

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL;
  if (!apiKey || !apiSecret || !url) {
    return Response.json(
      { error: "LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET must be set" },
      { status: 500 },
    );
  }

  // Minimal metadata (voice optional)
  const metadata = JSON.stringify({
    voice: body.sessionConfig?.voice,
    // No openai / instructions needed for server-side Groq agent
  });

  const at = new AccessToken(apiKey, apiSecret, {
    identity: "human-" + Math.random().toString(36).slice(2, 8),
    metadata,
  });

  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
    canUpdateOwnMetadata: true,
  });

  return Response.json({
    accessToken: await at.toJwt(),
    url,
    roomName,
  });
}