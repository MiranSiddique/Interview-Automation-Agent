"use client";

import { useEffect, useState, useCallback } from 'react';
import { getStatus, startAgent, stopAgent, dispatchInterview, DispatchResponse, getRoomAll } from '@/lib/agentApi';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Play, Square, Rocket, ChevronDown, ChevronUp, PlugZap, Plug2, Clipboard, ClipboardCheck, ExternalLink } from 'lucide-react';
import { useConnection } from '@/hooks/use-connection';
import { INTERVIEW_ROLES } from '@/data/interview-roles';

const PRESET_DESCRIPTIONS: Record<string, { role: string; desc: string }> = {
  'frontend developer': {
    role: "Frontend Developer",
    desc: "We are looking for a Senior Frontend Developer proficient in React, Next.js, Tailwind CSS, and state management. The role involves building responsive, highly performant web applications, collaborating with designers, and writing clean, maintainable code."
  },
  'machine learning engineer': {
    role: "Machine Learning Engineer",
    desc: "We are looking for a Machine Learning Engineer to design and implement end-to-end ML pipelines. Proficient in Python, TensorFlow/PyTorch, data preprocessing, and model evaluation. Experience with LLMs and deployment is a plus."
  },
  'general': {
    role: "General Software Engineer",
    desc: "A general software engineering role testing core programming, system design, data structures, algorithms, problem-solving, and communication skills."
  }
};

export function AgentControlPanel({ onDispatched }:{ onDispatched?: (d: DispatchResponse)=>void }) {
  const [status, setStatus] = useState<{running:boolean; pid?:number}|null>(null);
  const [loading, setLoading] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [lastDispatch, setLastDispatch] = useState<DispatchResponse | null>(null);
  const [transcriptsOpen, setTranscriptsOpen] = useState(false);
  const [fullTranscript, setFullTranscript] = useState<any[] | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const { shouldConnect, connect, disconnect } = useConnection();
  const [connectBusy, setConnectBusy] = useState(false);
  const [error, setError] = useState<string| null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  // Form states
  const [candidateName, setCandidateName] = useState<string>('John Doe');
  const [jobRole, setJobRole] = useState<string>('Frontend Developer');
  const [jobDescription, setJobDescription] = useState<string>(PRESET_DESCRIPTIONS['frontend developer'].desc);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async()=>{
    try { const s = await getStatus(); setStatus(s);} catch{ /* ignore */ }
  },[]);
  useEffect(()=>{ refresh(); const id = setInterval(refresh, 4000); return ()=> clearInterval(id); },[refresh]);

  const handleStart = async()=>{ setLoading(true); setError(null); try { await startAgent(); await refresh(); } catch(e:any){ setError(e.message||'Start failed'); } finally { setLoading(false);} };
  const handleStop = async()=>{ setLoading(true); setError(null); try { await stopAgent(); await refresh(); } catch(e:any){ setError(e.message||'Stop failed'); } finally { setLoading(false);} };
  
  const handleDispatch = async()=>{
    setDispatching(true); setError(null);
    try {
      const resp = await dispatchInterview(jobRole, jobDescription, candidateName);
      setLastDispatch(resp);
      onDispatched?.(resp);
    } catch(e:any){ setError(e.message||'Dispatch failed'); }
    finally { setDispatching(false);} };

  const handleConnect = async()=>{
    if (shouldConnect){ await disconnect(); return; }
    setConnectBusy(true); setError(null);
    try {
      // Ensure agent running
      if(!status?.running){ await startAgent(); await refresh(); }
      // If we don't have a dispatched room yet, dispatch now
      let disp = lastDispatch;
      if(!disp){
        disp = await dispatchInterview(jobRole, jobDescription, candidateName);
        setLastDispatch(disp);
        onDispatched?.(disp);
      }
      (window as any).__lk_room = disp.room;
      await connect();
    } catch(e:any){ setError(e.message||'Connect failed'); }
    finally { setConnectBusy(false);} };

  const handleCopyLink = () => {
    if (!lastDispatch) return;
    const url = `${window.location.origin}/room/${lastDispatch.room}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openTranscripts = async()=>{
    if(!lastDispatch) return;
    setTranscriptLoading(true); setTranscriptsOpen(true); setFullTranscript(null);
    try { const data = await getRoomAll(lastDispatch.room); setFullTranscript(data); }
    catch(e){ /* ignore */ }
    finally { setTranscriptLoading(false);} };

  useEffect(()=>{ if(!showLogs) return; let active=true; const base = process.env.NEXT_PUBLIC_AGENT_API_BASE || 'http://localhost:8000'; const pull= async()=>{ try { const r= await fetch(`${base}/agent/logs?limit=200`); if(r.ok){ const data= await r.json(); if(active) setLogs(data.lines||[]);} } catch{} finally { if(active) setTimeout(pull,2000);} }; pull(); return ()=>{active=false}; },[showLogs]);

  return (
    <div className="flex flex-col gap-3 p-4 border rounded-lg bg-white shadow-md w-full md:w-[380px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-neutral-700">Agent:</span>
          {status ? (status.running ? <Badge variant="secondary" className="bg-emerald-500 text-white">Running</Badge> : <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">Stopped</Badge>) : <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />}
        </div>
        <Button variant="ghost" size="icon" onClick={()=> setShowLogs(s=>!s)} className="h-8 w-8">
          {showLogs? <ChevronUp className="h-4 w-4"/> : <ChevronDown className="h-4 w-4"/>}
        </Button>
      </div>
      
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={handleStart} disabled={loading || status?.running} className="bg-neutral-800 hover:bg-neutral-700 text-white"><Play className="h-3.5 w-3.5 mr-1"/>Start</Button>
          <Button size="sm" variant="destructive" onClick={handleStop} disabled={loading || !status?.running} className="bg-rose-600 hover:bg-rose-500"><Square className="h-3.5 w-3.5 mr-1"/>Stop</Button>
          <Button size="sm" onClick={handleConnect} disabled={connectBusy || !lastDispatch} className={shouldConnect? 'bg-amber-600 hover:bg-amber-500 text-white':'bg-emerald-600 hover:bg-emerald-500 text-white'}>
            {connectBusy && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin"/>}
            {shouldConnect? <><Plug2 className="h-3.5 w-3.5 mr-1"/>Disconnect</>:<><PlugZap className="h-3.5 w-3.5 mr-1"/>Connect</>}
          </Button>
        </div>
        <div className="text-[10px] text-neutral-400">
          1. Start agent  →  2. Dispatch (creates room)  →  3. Connect / Share URL
        </div>
      </div>

      <hr className="border-neutral-100 my-1" />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Candidate Name</label>
          <input
            type="text"
            className="flex h-9 w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1 text-sm shadow-sm transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            value={candidateName}
            onChange={(e) => setCandidateName(e.target.value)}
            placeholder="e.g. John Doe"
          />
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Load Preset</label>
          </div>
          <Select defaultValue="frontend developer" onValueChange={(val) => {
            const preset = PRESET_DESCRIPTIONS[val];
            if (preset) {
              setJobRole(preset.role);
              setJobDescription(preset.desc);
            }
          }}>
            <SelectTrigger className="h-8 text-xs text-neutral-600 bg-neutral-50"><SelectValue placeholder="Select preset..." /></SelectTrigger>
            <SelectContent>
              {INTERVIEW_ROLES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Job Role</label>
          <input
            type="text"
            className="flex h-9 w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1 text-sm shadow-sm transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            value={jobRole}
            onChange={(e) => setJobRole(e.target.value)}
            placeholder="e.g. Frontend Developer"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Job Description</label>
          <textarea
            className="flex min-h-[90px] w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs shadow-sm transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Describe the job requirements..."
          />
        </div>

        <Button 
          size="sm" 
          onClick={handleDispatch} 
          disabled={!status?.running || dispatching} 
          className="border bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow transition mt-1"
        >
          {dispatching ? (
            <><Loader2 className="h-4 w-4 mr-1 animate-spin"/>Dispatching...</>
          ) : (
            <><Rocket className="h-4 w-4 mr-1"/>Create & Dispatch Agent</>
          )}
        </Button>

        {lastDispatch && (
          <div className="p-3 border border-indigo-100 rounded-lg bg-indigo-50/50 flex flex-col gap-2 mt-1 shadow-sm">
            <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-widest flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse"></span>
              Interview Link Ready
            </div>
            <div className="text-[11px] text-neutral-500">
              The agent is waiting in the room. Open the link below to begin the interview:
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                readOnly
                value={`${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/room/${lastDispatch.room}`}
                className="flex h-8 flex-grow rounded border border-neutral-300 bg-white px-2 py-1 text-[10px] font-mono shadow-inner focus:outline-none text-neutral-600"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2.5 text-xs bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50 transition"
                onClick={handleCopyLink}
              >
                {copied ? <ClipboardCheck className="h-3.5 w-3.5 text-emerald-600" /> : <Clipboard className="h-3.5 w-3.5 text-neutral-500" />}
              </Button>
            </div>
            <a
              href={`/room/${lastDispatch.room}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs py-2 transition text-center shadow-sm"
            >
              Open Interview Room <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}

        {lastDispatch && (
          <Button size="sm" variant="outline" onClick={openTranscripts} disabled={transcriptLoading} className="justify-start border-neutral-200 text-neutral-700">
            {transcriptLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin"/> : <ChevronDown className="h-4 w-4 mr-1"/>}
            View Session Details
          </Button>
        )}
      </div>

      {error && <div className="text-xs text-rose-600 font-semibold bg-rose-50 border border-rose-100 p-2 rounded">{error}</div>}
      {showLogs && <div className="border rounded h-40 overflow-auto bg-neutral-50 p-2 text-[10px] font-mono whitespace-pre-wrap leading-tight text-neutral-600 border-neutral-200">{logs.join('\n')}</div>}
      
      {transcriptsOpen && lastDispatch && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col border border-neutral-200">
            <div className="p-3 border-b flex items-center justify-between bg-neutral-50">
              <div className="text-sm font-semibold text-neutral-700">Room Details – {lastDispatch.room}</div>
              <button onClick={()=> setTranscriptsOpen(false)} className="text-xs font-medium text-neutral-400 hover:text-neutral-600 transition">Close</button>
            </div>
            <div className="p-4 overflow-y-auto text-[11px] font-mono whitespace-pre-wrap leading-relaxed bg-neutral-900 text-neutral-200">
              {transcriptLoading && 'Loading...'}
              {!transcriptLoading && fullTranscript && fullTranscript.length === 0 && 'No transcript data yet.'}
              {!transcriptLoading && fullTranscript && fullTranscript.length > 0 && <pre className="text-emerald-400">{JSON.stringify(fullTranscript, null, 2)}</pre>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
