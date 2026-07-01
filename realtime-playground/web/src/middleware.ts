import { NextRequest, NextResponse } from "next/server";

// Rewrite /roomName=<room> to /room/<room>
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/roomName=")) {
    const room = pathname.substring("/roomName=".length);
    const url = req.nextUrl.clone();
    url.pathname = `/room/${room}`;
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/roomName=:path*"],
};
