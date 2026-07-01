"use client";
import { useConnection } from "@/hooks/use-connection";
import { Button } from "@/components/ui/button";

export function Header() {
  const conn = useConnection();
  const connected = conn?.shouldConnect;
  return (
    <div className="flex items-center gap-2">
      <Button
        variant={connected ? "outline" : "default"}
        onClick={() => (connected ? conn?.disconnect() : conn?.connect())}
      >
        {connected ? "Disconnect" : "Connect"}
      </Button>
    </div>
  );
}