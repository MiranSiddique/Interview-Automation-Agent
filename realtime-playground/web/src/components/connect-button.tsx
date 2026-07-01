"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useConnection } from "@/hooks/use-connection";
import { Loader2, Mic } from "lucide-react";
import { usePlaygroundState } from "@/hooks/use-playground-state";
import { dispatchInterview } from "@/lib/agentApi";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { INTERVIEW_ROLES } from "@/data/interview-roles";

export function ConnectButton() {
  const { connect, disconnect, shouldConnect } = useConnection();
  const [connecting, setConnecting] = useState<boolean>(false);
  const { pgState, dispatch } = usePlaygroundState();
  const [role, setRole] = useState<string>("frontend developer");

  const handleConnectionToggle = async () => {
    if (shouldConnect) {
      await disconnect();
    } else {
      await initiateConnection();
    }
  };

  const initiateConnection = useCallback(async () => {
    setConnecting(true);
    try {
      const dispatchResp = await dispatchInterview(role);
      dispatch({ type: "SET_ROOM_NAME", payload: dispatchResp.room });
      await connect();
    } catch (error) {
      console.error("Connection failed:", error);
    } finally {
      setConnecting(false);
    }
  }, [connect, dispatch, role]);

  return (
    <div className="flex items-center gap-2">
      <Select value={role} onValueChange={setRole}>
        <SelectTrigger className="h-8 w-48 text-xs"><SelectValue placeholder="Role"/></SelectTrigger>
        <SelectContent>
          {INTERVIEW_ROLES.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        onClick={handleConnectionToggle}
        disabled={connecting || shouldConnect}
        className="text-sm font-semibold bg-oai-green"
      >
        {connecting || shouldConnect ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Connecting
          </>
        ) : (
          <>
            <Mic className="mr-2 h-4 w-4" />
            Connect
          </>
        )}
      </Button>
    </div>
  );
}
