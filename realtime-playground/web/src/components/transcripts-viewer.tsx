"use client";

import { useEffect, useState } from 'react';
import { listRooms, getRoomLatest, getRoomAnalysis, TranscriptSummary } from '@/lib/agentApi';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCcw, Award, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function TranscriptsViewer(){
  const [rooms, setRooms] = useState<TranscriptSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<string|null>(null);
  const [latest, setLatest] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [roomLoading, setRoomLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [tab, setTab] = useState<'transcript' | 'evaluation'>('evaluation');

  const loadRooms = async()=>{ setLoading(true); try { setRooms(await listRooms()); } finally { setLoading(false);} };
  
  const loadLatest = async(room:string)=>{ 
    setRoomLoading(true); 
    setLatest(null);
    setAnalysis(null);
    try { 
      setLatest(await getRoomLatest(room)); 
    } catch(e){ 
      console.error(e);
    } finally { 
      setRoomLoading(false);
    }

    setAnalysisLoading(true);
    try {
      const data = await getRoomAnalysis(room);
      setAnalysis(data);
    } catch(e) {
      console.log("No analysis found yet for this room:", e);
    } finally {
      setAnalysisLoading(false);
    }
  };

  useEffect(()=>{ loadRooms(); const id = setInterval(loadRooms, 10000); return ()=> clearInterval(id); },[]);
  useEffect(()=>{ if(selectedRoom) loadLatest(selectedRoom); },[selectedRoom]);

  return (
    <div className="flex flex-col gap-3 border rounded-lg p-4 bg-white shadow-md">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-700">Interview Sessions</h3>
        <Button variant="ghost" size="icon" onClick={loadRooms} disabled={loading} className="h-8 w-8">
          <RefreshCcw className={`h-4 w-4 ${loading? 'animate-spin':''}`}/>
        </Button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 max-w-full">
        {rooms.length === 0 && !loading && <span className="text-xs text-neutral-400 italic">No interview sessions found.</span>}
        {rooms.map(r=> (
          <button 
            key={r.file} 
            onClick={()=> setSelectedRoom(r.room)} 
            className={`px-3 py-1.5 text-xs rounded-md border font-medium transition shrink-0 ${selectedRoom===r.room? 'bg-indigo-600 text-white border-indigo-600 shadow-sm':'bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-600'}`}
          >
            {r.candidate_name ? `${r.candidate_name} (${r.job_role})` : `${r.room.slice(0,8)}…`} ({r.items})
          </button>
        ))}
        {loading && <Loader2 className="h-4 w-4 animate-spin text-neutral-400 mt-1.5"/>}
      </div>
      {selectedRoom && (
        <div className="flex flex-col gap-2 mt-1">
          <div className="flex border-b border-neutral-200">
            <button
              onClick={() => setTab('evaluation')}
              className={`px-3 py-1.5 text-xs font-semibold -mb-[1px] border-b-2 transition flex items-center gap-1 ${tab === 'evaluation' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-neutral-400 hover:text-neutral-600'}`}
            >
              AI Evaluation Report
              {analysisLoading && <Loader2 className="h-3 w-3 animate-spin"/>}
            </button>
            <button
              onClick={() => setTab('transcript')}
              className={`px-3 py-1.5 text-xs font-semibold -mb-[1px] border-b-2 transition ${tab === 'transcript' ? 'border-neutral-800 text-neutral-800' : 'border-transparent text-neutral-400 hover:text-neutral-600'}`}
            >
              Raw Transcript Log
            </button>
          </div>
          
          <div className="border rounded-lg p-3 max-h-[420px] overflow-y-auto bg-neutral-50/50 border-neutral-200">
            {roomLoading && (
              <div className="flex items-center gap-2 text-neutral-500 py-6 justify-center">
                <Loader2 className="h-5 w-5 animate-spin"/>
                <span className="text-xs font-medium">Loading session...</span>
              </div>
            )}
            
            {!roomLoading && tab === 'transcript' && latest && (
              <pre className="whitespace-pre-wrap break-words text-[10px] leading-snug text-emerald-400 bg-neutral-900 p-3 rounded-lg border border-neutral-800 font-mono shadow-inner">{JSON.stringify(latest, null, 2)}</pre>
            )}

            {!roomLoading && tab === 'evaluation' && (
              analysis ? (
                <div className="flex flex-col gap-4 text-xs">
                  {analysis.map((qEval: any, idx: number) => {
                    const score = qEval.score || 0;
                    let scoreColor = "bg-rose-50 text-rose-700 border-rose-200";
                    if (score >= 80) scoreColor = "bg-emerald-50 text-emerald-700 border-emerald-200";
                    else if (score >= 60) scoreColor = "bg-amber-50 text-amber-700 border-amber-200";

                    return (
                      <div key={idx} className="border border-neutral-200/60 rounded-lg p-4 bg-white shadow-sm flex flex-col gap-3">
                        <div className="flex items-center justify-between gap-2 border-b border-neutral-100 pb-2">
                          <span className="font-bold text-neutral-700 text-xs uppercase tracking-wider">Question {idx + 1}</span>
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className={`font-mono font-bold text-xs ${scoreColor}`}>Score: {score}/100</Badge>
                            <Badge variant="outline" className="bg-neutral-50 text-neutral-600 border-neutral-200 text-[10px] uppercase font-bold">{qEval.difficulty}</Badge>
                          </div>
                        </div>
                        
                        <div className="flex flex-col gap-2.5">
                          <div>
                            <span className="font-semibold text-neutral-400 block text-[9px] uppercase tracking-wider">Question:</span>
                            <p className="text-neutral-800 font-medium text-xs leading-relaxed">{qEval.question}</p>
                          </div>

                          <div className="bg-neutral-50 p-2.5 rounded border border-neutral-150 shadow-inner">
                            <span className="font-semibold text-neutral-400 block text-[9px] uppercase tracking-wider">Candidate Answer:</span>
                            <p className="text-neutral-700 italic text-xs leading-relaxed">"{qEval.candidate_answer || qEval.answer}"</p>
                          </div>

                          <div>
                            <span className="font-semibold text-neutral-400 block text-[9px] uppercase tracking-wider">Ideal Answer:</span>
                            <p className="text-neutral-600 text-xs leading-relaxed">{qEval.ideal_answer}</p>
                          </div>

                          {qEval.strengths && qEval.strengths.length > 0 && (
                            <div>
                              <span className="font-semibold text-neutral-400 block text-[9px] uppercase tracking-wider">Strengths:</span>
                              <ul className="list-disc list-inside text-neutral-600 pl-1 text-[11px] leading-relaxed">
                                {qEval.strengths.map((str: string, i: number) => (
                                  <li key={i}>{str}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {qEval.technical_errors && qEval.technical_errors.length > 0 && (
                            <div>
                              <span className="font-semibold text-rose-500 block text-[9px] uppercase tracking-wider">Technical Errors:</span>
                              <ul className="list-disc list-inside text-rose-700 pl-1 bg-rose-50/50 p-2 rounded border border-rose-100 text-[11px] leading-relaxed">
                                {qEval.technical_errors.map((err: string, i: number) => (
                                  <li key={i}>{err}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1 pt-3 border-t border-neutral-100">
                            <div>
                              <span className="font-semibold text-neutral-400 block text-[9px] uppercase tracking-wider">Key Concepts covered:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {qEval.key_concepts && qEval.key_concepts.length > 0 ? (
                                  qEval.key_concepts.map((c: string, i: number) => (
                                    <span key={i} className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 text-[9px] font-semibold">{c}</span>
                                  ))
                                ) : (
                                  <span className="text-neutral-400 italic text-[10px]">None identified</span>
                                )}
                              </div>
                            </div>
                            <div>
                              <span className="font-semibold text-neutral-400 block text-[9px] uppercase tracking-wider">Missing Concepts:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {qEval.missing_concepts && qEval.missing_concepts.length > 0 ? (
                                  qEval.missing_concepts.map((c: string, i: number) => (
                                    <span key={i} className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100 text-[9px] font-semibold">{c}</span>
                                  ))
                                ) : (
                                  <span className="text-emerald-600 italic text-[10px] flex items-center gap-0.5"><CheckCircle className="h-3 w-3 inline"/> None missed</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="mt-2 p-3 bg-indigo-50/30 border border-indigo-100 rounded-lg flex flex-col gap-1">
                            <span className="font-bold text-indigo-800 block text-[9px] uppercase tracking-wider">Justification & Recommendation:</span>
                            <p className="text-neutral-700 text-[11px] leading-relaxed">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold mr-1.5 uppercase ${
                                qEval.recommendation === 'Proceed' ? 'bg-emerald-100 text-emerald-800' :
                                qEval.recommendation === 'Borderline' ? 'bg-amber-100 text-amber-800' :
                                'bg-rose-100 text-rose-800'
                              }`}>{qEval.recommendation}</span>
                              {qEval.justification}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center text-neutral-400 py-8 text-xs flex flex-col items-center justify-center gap-2">
                  {analysisLoading ? (
                    <div className="flex items-center justify-center gap-2 py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-indigo-500"/>
                      <span className="font-medium text-neutral-500">Evaluating transcript with Groq AI...</span>
                    </div>
                  ) : (
                    <>
                      <Award className="h-8 w-8 text-neutral-300" />
                      <span>No AI evaluation found for this room. Make sure the interview completes successfully to trigger analysis.</span>
                    </>
                  )}
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
