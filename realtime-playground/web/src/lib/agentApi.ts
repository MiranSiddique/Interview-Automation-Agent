// Simple client for FastAPI InterviewAgent backend
// Base URL can be configured via NEXT_PUBLIC_AGENT_API_BASE, defaults to http://localhost:8000

const BASE = process.env.NEXT_PUBLIC_AGENT_API_BASE || 'http://localhost:8000';

export type AgentStatus = {
  running: boolean;
  pid?: number;
  started_at?: string;
  command?: string[];
};

export type DispatchResponse = {
  room: string;
  dispatch_id?: string;
  metadata: Record<string, any>;
  agent_name?: string;
};

export type TranscriptSummary = {
  room: string;
  timestamp: string;
  file: string;
  items: number;
  candidate_name?: string;
  job_role?: string;
};

export async function getStatus(): Promise<AgentStatus> {
  const r = await fetch(`${BASE}/agent/status`, { cache: 'no-store' });
  if (!r.ok) throw new Error('status failed');
  return r.json();
}

export async function startAgent(): Promise<AgentStatus> {
  const r = await fetch(`${BASE}/agent/start`, { method: 'POST' });
  if (!r.ok) throw new Error('start failed');
  return r.json();
}

export async function stopAgent(): Promise<AgentStatus> {
  const r = await fetch(`${BASE}/agent/stop`, { method: 'POST' });
  if (!r.ok) throw new Error('stop failed');
  return r.json();
}

export async function dispatchInterview(
  role?: string,
  jobDescription?: string,
  candidateName?: string,
  extraMetadata?: Record<string, any>
): Promise<DispatchResponse> {
  const body: any = {};
  if (role) body.role = role;
  if (jobDescription) body.job_description = jobDescription;
  if (candidateName) body.candidate_name = candidateName;
  if (extraMetadata) body.extra_metadata = extraMetadata;
  const r = await fetch(`${BASE}/agent/dispatch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('dispatch failed');
  return r.json();
}

export async function getRoomAnalysis(room: string): Promise<any[]> {
  const r = await fetch(`${BASE}/rooms/${room}/analysis`);
  if (!r.ok) throw new Error('room analysis failed');
  return r.json();
}

export async function listRooms(): Promise<TranscriptSummary[]> {
  const r = await fetch(`${BASE}/rooms`, { cache: 'no-store' });
  if (!r.ok) throw new Error('rooms failed');
  return r.json();
}

export async function getRoomLatest(room: string): Promise<any> {
  const r = await fetch(`${BASE}/rooms/${room}`);
  if (!r.ok) throw new Error('room latest failed');
  return r.json();
}

export async function getRoomAll(room: string): Promise<any[]> {
  const r = await fetch(`${BASE}/rooms/${room}/all`);
  if (!r.ok) throw new Error('room all failed');
  return r.json();
}

export async function getFullTranscript(room: string): Promise<any[]> {
  return getRoomAll(room);
}

export async function getLogs(limit=200): Promise<string[]> {
  const r = await fetch(`${BASE}/agent/logs?limit=${limit}`);
  if (!r.ok) throw new Error('logs failed');
  const data = await r.json();
  return data.lines || [];
}
