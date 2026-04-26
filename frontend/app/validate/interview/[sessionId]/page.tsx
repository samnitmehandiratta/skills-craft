"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";
import type { ValidationResult, SkillScoreResult, SkillMapEntry } from "@/lib/types";

type Phase =
  | "preparing" | "speaking" | "listening"
  | "heard" | "scoring" | "no_speech" | "complete";

interface ToneMetrics { score: number; hesitations: number; specificity: number; wordCount: number; }
interface FacePos { x: number; y: number }

// ── TTS helpers ───────────────────────────────────────────────────────────────
function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined") return null;
  const vs = window.speechSynthesis.getVoices();
  return (
    vs.find((v) => v.name === "Google US English") ||
    vs.find((v) => v.name.includes("Google") && v.lang.startsWith("en")) ||
    vs.find((v) => v.lang === "en-US") ||
    vs.find((v) => v.lang.startsWith("en-")) ||
    vs.find((v) => v.lang.startsWith("en")) ||
    vs[0] || null
  );
}

function doSpeak(text: string, onDone: () => void): void {
  const ss = window.speechSynthesis;
  ss.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate  = 0.9;
  utter.pitch = 1.0;
  const voice = pickVoice();
  if (voice) utter.voice = voice;
  utter.onend   = onDone;
  utter.onerror = onDone;
  ss.speak(utter);
  // Absolute safety: never leave the interview stuck
  setTimeout(onDone, Math.max(5000, text.length * 80));
}

async function speakText(text: string): Promise<void> {
  if (!text.trim() || typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  // Small post-cancel pause so Chrome doesn't drop the next utterance
  await new Promise<void>((r) => setTimeout(r, 150));
  return new Promise<void>((resolve) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      doSpeak(text, resolve);
    } else {
      // Voices not yet loaded — wait for them, but cap at 2 s then speak anyway
      let fired = false;
      const fire = () => { if (fired) return; fired = true; doSpeak(text, resolve); };
      window.speechSynthesis.addEventListener("voiceschanged", fire, { once: true });
      setTimeout(fire, 2000);
    }
  });
}

function detectFaceCenter(video: HTMLVideoElement, canvas: HTMLCanvasElement): FacePos | null {
  const W = 80, H = 60;
  if (video.readyState < 2) return null;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);
  let weight = 0, wx = 0, wy = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const r = data[i], g = data[i+1], b = data[i+2];
    const lum = r*.299 + g*.587 + b*.114;
    // Inclusive skin detection: works for light, medium, and dark tones
    const maxC = Math.max(r,g,b), minC = Math.min(r,g,b);
    const skin = r > 40 && g > 20 && b > 10 && r > b && lum > 25 && lum < 245 &&
      (maxC - minC) > 8 && r >= g * 0.7 && r >= b * 0.7;
    if (skin) { weight++; wx+=x; wy+=y; }
  }
  if (weight < 25) return null;  // lowered threshold: 60→25
  return { x: wx/weight/W, y: wy/weight/H };
}

function analyzeTone(transcript: string, listenStartMs: number): ToneMetrics {
  const words = transcript.toLowerCase().split(/\s+/).filter(Boolean);
  const hesitSet = new Set(["um","uh","like","well","maybe","sort","kind","perhaps"]);
  const confSet  = new Set(["definitely","always","exactly","certainly","specifically","for sure","i know","i always"]);
  const techNums = /\d/.test(transcript);
  const hesitations = words.filter((w) => hesitSet.has(w)).length;
  const confidences  = words.filter((w) => confSet.has(w)).length;
  const durationMs   = Date.now() - listenStartMs;
  const wpm = durationMs > 2000 ? Math.round((words.length/durationMs)*60000) : 0;
  const score = Math.min(100, Math.max(0, 50 + confidences*10 - hesitations*7 + (techNums?12:0) + (words.length>40?8:0) + (words.length>80?7:0) + (wpm>200?-10:0)));
  const specificity = Math.min(100, (confidences*15) + (techNums?25:0) + Math.min(words.length, 100));
  return { score, hesitations, specificity, wordCount: words.length };
}

// ── Minecraft verdict map ─────────────────────────────────────────────────────
const MC_V: Record<string, { border: string; fill: string; text: string }> = {
  STRONG:   { border: "#3d7514", fill: "#80ff20", text: "#80ff20" },
  ADEQUATE: { border: "#b08000", fill: "#f8b700", text: "#f8b700" },
  WEAK:     { border: "#a04000", fill: "#ffaa44", text: "#ffaa44" },
  FAIL:     { border: "#7a0000", fill: "#ff4040", text: "#ff4040" },
  TESTING:  { border: "#004488", fill: "#4fd0e4", text: "#4fd0e4" },
  PENDING:  { border: "#444444", fill: "#555555", text: "#888888" },
};

// ── Result screen ─────────────────────────────────────────────────────────────
const RES_MC: Record<string, { accent: string; label: string }> = {
  VERIFIED:   { accent: "#80ff20", label: "✔ VERIFIED"   },
  PARTIAL:    { accent: "#f8b700", label: "~ PARTIAL"    },
  UNVERIFIED: { accent: "#ff4040", label: "✘ UNVERIFIED" },
};
function ResultScreen({ result, router }: { result: ValidationResult; router: ReturnType<typeof useRouter> }) {
  const mc = RES_MC[result.overall_verdict] || RES_MC.PARTIAL;
  const profileSid = typeof window !== "undefined" ? sessionStorage.getItem("unmapped_session") : null;
  const terminatedEarly = typeof window !== "undefined" && sessionStorage.getItem("unmapped_interview_terminated_early") === "1";
  const sorted = [...result.skill_scores].sort((a, b) => b.confidence - a.confidence);
  const maxConf = Math.max(...sorted.map((s) => s.confidence), 1);

  return (
    <main className="min-h-screen mc-bg mc-font text-[#e0e0e0]">
      <header className="mc-panel px-6 py-3 flex items-center justify-between border-x-0 border-t-0">
        <button onClick={() => router.push("/")} className="mc-btn-stone px-3 py-1 text-base">← HOME</button>
        <span className="text-[#f8b700] text-xl mc-text-shadow">SKILL CERTIFICATE</span>
        <span className="text-[#888] text-base">#{result.certificate.certificate_id.slice(0,8)}</span>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-5">

        {/* Early termination notice */}
        {terminatedEarly && (
          <div className="mc-panel px-5 py-4 flex items-center gap-3" style={{ borderColor: "#ff4040" }}>
            <span className="text-2xl">⚠</span>
            <div>
              <p className="mc-text-shadow text-[#ff6060] text-lg">INTERVIEW ENDED EARLY</p>
              <p className="text-[#888] text-sm">5 consecutive incorrect answers detected — test stopped automatically.</p>
            </div>
          </div>
        )}

        {/* Overall verdict */}
        <div className="mc-panel p-6 text-center" style={{ borderColor: mc.accent }}>
          <div className="text-5xl mc-text-shadow mb-2" style={{ color: mc.accent }}>{mc.label}</div>
          <p className="text-lg text-[#e0e0e0]">{result.certificate.verdict_summary}</p>
          <p className="text-sm text-[#888] mt-2">{result.certificate.integrity_note}</p>
        </div>

        {/* Hidden skills discovered */}
        {result.hidden_skills && result.hidden_skills.length > 0 && (
          <div className="mc-panel p-5" style={{ borderColor: "#c084fc55" }}>
            <p className="text-xl mc-text-shadow mb-1 tracking-widest" style={{ color: "#c084fc" }}>
              ✦ {result.hidden_skills.length} HIDDEN SKILL{result.hidden_skills.length !== 1 ? "S" : ""} DISCOVERED
            </p>
            <p className="text-[#888] text-xs mb-4">Skills you demonstrated but never claimed — found from your answers</p>
            <div className="space-y-2">
              {result.hidden_skills.map((h) => (
                <div key={h.skill} className="mc-panel-inset px-4 py-2 flex items-center justify-between">
                  <div>
                    <span className="text-[#e0e0e0] text-sm">{h.skill}</span>
                    {h.source_activity && (
                      <p className="text-[#555] text-xs mt-0.5">From: {h.source_activity}</p>
                    )}
                  </div>
                  <span className="mc-font text-xs mc-text-shadow shrink-0 ml-3" style={{ color: "#c084fc" }}>
                    {Math.round(h.confidence * 100)}% implied
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SKILL GRAPH ── */}
        <div className="mc-panel-inset p-5">
          <p className="text-[#f8b700] text-xl mc-text-shadow mb-1 tracking-widest">WHAT YOU REALLY KNOW</p>
          <p className="text-[#888] text-xs mb-5">Based on AI-verified answers — sorted by confidence</p>

          <div className="space-y-3">
            {sorted.map((s: SkillScoreResult) => {
              const mv = s.verdict === "VERIFIED" ? MC_V.STRONG : s.verdict === "PARTIAL" ? MC_V.ADEQUATE : MC_V.FAIL;
              const barW = Math.round((s.confidence / maxConf) * 100);
              return (
                <div key={s.skill}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[#e0e0e0] text-sm truncate flex-1 mr-3">{s.skill}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="mc-text-shadow text-xs" style={{ color: mv.text }}>
                        {s.verdict === "VERIFIED" ? "✔ VERIFIED" : s.verdict === "PARTIAL" ? "~ PARTIAL" : "✘ UNVERIFIED"}
                      </span>
                      <span className="mc-panel px-1.5 py-0 text-xs mc-text-shadow" style={{ color: mv.fill }}>
                        {s.confidence}%
                      </span>
                    </div>
                  </div>
                  {/* Pixelated confidence bar */}
                  <div className="mc-xp-bar">
                    <div
                      className="mc-xp-fill transition-all duration-700"
                      style={{ width: `${barW}%`, background: mv.fill, boxShadow: `0 0 8px ${mv.fill}66` }}
                    />
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <span className="text-[#555] text-xs">{s.questions_asked} question{s.questions_asked!==1?"s":""} asked</span>
                    {/* Confidence tier label */}
                    <span className="text-[#555] text-xs">
                      {s.confidence >= 90 ? "Expert" : s.confidence >= 70 ? "Proficient" : s.confidence >= 40 ? "Developing" : "Needs work"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Chart legend */}
          <div className="flex gap-4 mt-5 pt-4 border-t border-[#2a2a2a]">
            {[["VERIFIED","#80ff20","≥70% confidence"],["PARTIAL","#f8b700","40–69%"],["UNVERIFIED","#ff4040","<40%"]].map(([label,color,desc]) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className="w-3 h-2" style={{ background: color }} />
                <span className="text-[#888] text-xs">{label} <span className="text-[#555]">({desc})</span></span>
              </div>
            ))}
          </div>
        </div>

        {/* Session integrity */}
        <div className="mc-panel p-4 flex items-center justify-between">
          <div>
            <span className="text-[#e0e0e0]">SESSION INTEGRITY</span>
            <p className="text-[#888] text-xs mt-0.5">Face tracking + behavioural signals</p>
          </div>
          <span className="text-xl mc-text-shadow" style={{ color: result.cheat_risk_level==="LOW"?"#80ff20":result.cheat_risk_level==="MEDIUM"?"#f8b700":"#ff4040" }}>
            {result.cheat_risk_level} RISK
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          {profileSid && (
            <button onClick={() => router.push(`/profile/${profileSid}`)} className="mc-btn-green flex-1 py-3 text-xl">
              VIEW FULL SKILLS PROFILE →
            </button>
          )}
          <button onClick={() => router.push("/")} className="mc-btn-stone px-5 py-3 text-base">HOME</button>
        </div>
      </div>
    </main>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function InterviewPage() {
  const router = useRouter();
  const params = useParams();
  const validationSessionId = params.sessionId as string;

  const [phase,          setPhase]          = useState<Phase>("preparing");
  const [currentQuestion,setCurrentQuestion]= useState("");
  const [currentSkill,   setCurrentSkill]   = useState("");
  const [questionNumber, setQuestionNumber] = useState(1);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [result,         setResult]         = useState<ValidationResult | null>(null);
  const [submitError,    setSubmitError]    = useState<string | null>(null);

  const [skillMap,        setSkillMap]       = useState<SkillMapEntry[]>([]);
  const [toneBySkill,     setToneBySkill]    = useState<Record<string, number>>({});
  const [lastTone,        setLastTone]       = useState<ToneMetrics | null>(null);
  const [justVerdict,     setJustVerdict]    = useState<string | null>(null);
  const [justSkill,       setJustSkill]      = useState<string | null>(null);
  const [depthUnlocked,   setDepthUnlocked]  = useState(false);
  const [ttsWorking,      setTtsWorking]     = useState(true);  // optimistic; set false on first error

  const [liveTranscript, setLiveTranscript] = useState("");
  const liveRef          = useRef("");
  const [showTypeInput,  setShowTypeInput]  = useState(false);
  const [typedAnswer,    setTypedAnswer]    = useState("");

  const hasSpeechRef      = useRef(false);
  const lastSpeechRef     = useRef(0);
  const listenStartRef    = useRef(0);
  const [silenceMs,      setSilenceMs]      = useState(0);
  const vadRef            = useRef<ReturnType<typeof setInterval> | null>(null);
  const isSubmittingRef   = useRef(false);  // guard against double-submit

  const audioCtxRef    = useRef<AudioContext | null>(null);
  const recorderRef    = useRef<MediaRecorder | null>(null);
  const chunksRef      = useRef<Blob[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srRef          = useRef<any>(null);

  const videoRef       = useRef<HTMLVideoElement>(null);
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const streamRef      = useRef<MediaStream | null>(null);
  const faceHistRef    = useRef<Array<FacePos | null>>([]);
  const gazeStartRef   = useRef<number | null>(null);
  const gazeAccumRef   = useRef(0);
  const trackRef       = useRef<ReturnType<typeof setInterval> | null>(null);

  const [cameraActive,   setCameraActive]   = useState(false);
  const [faceDetected,   setFaceDetected]   = useState(false);
  const [facePos,        setFacePos]        = useState<FacePos | null>(null);
  const [faceStable,     setFaceStable]     = useState(true);
  const [gazeWarnCount,  setGazeWarnCount]  = useState(0);
  const [showGazeWarn,   setShowGazeWarn]   = useState(false);
  const [stopped,        setStopped]        = useState(false);

  const tabRef   = useRef(0);
  const focusRef = useRef(0);
  const pasteRef = useRef(0);
  const qStartRef= useRef(Date.now());
  const prevTotalRef = useRef(0);
  // Used inside camera interval to know current phase without dep issues
  const phaseRef      = useRef<Phase>("preparing");
  const cameraReadyAt = useRef(0);  // timestamp when camera warmed up

  useEffect(() => { liveRef.current = liveTranscript; }, [liveTranscript]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Re-attach stream to video element after cameraActive flip causes a new DOM node
  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraActive]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const submitAnswer = useCallback(async (text: string, skill: string) => {
    if (!text.trim()) return;
    if (isSubmittingRef.current) return;  // prevent double-submit
    isSubmittingRef.current = true;
    setPhase("scoring");
    setSubmitError(null);
    const tone = analyzeTone(text, listenStartRef.current);
    setLastTone(tone);
    setToneBySkill((p) => ({ ...p, [skill]: tone.score }));
    try {
      const res = await api.submitValidationAnswer(validationSessionId, text.trim(), {
        tab_switches: tabRef.current, focus_losses: focusRef.current,
        paste_events: pasteRef.current, answer_time_ms: Date.now() - qStartRef.current,
        gaze_away_seconds: gazeAccumRef.current,
      });
      tabRef.current=0; focusRef.current=0; pasteRef.current=0; gazeAccumRef.current=0;
      qStartRef.current = Date.now();

      if (res.skill_map?.length) setSkillMap(res.skill_map);
      if (res.just_scored_skill)   setJustSkill(res.just_scored_skill);
      if (res.just_scored_verdict) setJustVerdict(res.just_scored_verdict);

      // Detect adaptive depth increase
      if (prevTotalRef.current > 0 && res.total_questions > prevTotalRef.current) {
        setDepthUnlocked(true);
        setTimeout(() => setDepthUnlocked(false), 3000);
      }
      prevTotalRef.current = res.total_questions;

      if (res.is_complete) {
        setPhase("complete");
        if (res.terminated_early) sessionStorage.setItem("unmapped_interview_terminated_early", "1");
        const vr = await api.getValidationResult(validationSessionId);
        setResult(vr);
        sessionStorage.setItem("unmapped_validation_result", JSON.stringify(vr));

        // Build a synthetic skill profile so the profile page has data to display
        const claimedJson = sessionStorage.getItem("unmapped_validation_claimed_skills");
        const claimedSkills: string[] = claimedJson ? JSON.parse(claimedJson) : [];
        const countryCode = sessionStorage.getItem("unmapped_country") || "GH";
        const profileSid  = sessionStorage.getItem("unmapped_session") || validationSessionId;
        const hiddenSkills = (vr.hidden_skills || []).map((h) => ({
          skill: h.skill,
          category: h.category || "domain",
          is_hidden: true,
          confidence: h.confidence,
          source_activity: h.source_activity,
        }));
        const explicitSkills = vr.skill_scores.map((ss) => ({
          skill: ss.skill,
          category: "domain",
          is_hidden: false,
          confidence: ss.confidence / 100,
        }));
        const syntheticProfile = {
          profile_id: vr.validation_session_id,
          session_id: profileSid,
          generated_at: vr.generated_at,
          country: { code: countryCode, name: countryCode, region: "" },
          summary: vr.certificate.verdict_summary,
          skills: [...explicitSkills, ...hiddenSkills],
          skill_counts: {
            total: explicitSkills.length + hiddenSkills.length,
            explicit: explicitSkills.length,
            hidden: hiddenSkills.length,
          },
          categories: { domain: claimedSkills },
        };
        const profileJson = JSON.stringify(syntheticProfile);
        sessionStorage.setItem("unmapped_profile", profileJson);

        // Push profile to backend so risk/opportunities pages can load it
        const storeKey = profileSid || validationSessionId;
        api.storeProfile(storeKey, syntheticProfile).catch(() => {});

        // Auto-save to account if user is logged in — no manual action needed
        if (isLoggedIn()) {
          const validationJson = JSON.stringify(vr);
          api.saveProfile(storeKey, profileJson, validationJson)
            .catch(() => { /* silent — user can retry from profile page */ });
        }

        streamRef.current?.getTracks().forEach((t) => t.stop());
        if (trackRef.current) clearInterval(trackRef.current);
      } else {
        setCurrentQuestion(res.next_question!);
        setCurrentSkill(res.skill_being_tested!);
        setQuestionNumber(res.question_number);
        setTotalQuestions(res.total_questions);
        setLiveTranscript(""); setTypedAnswer(""); setShowTypeInput(false);
        setJustVerdict(null);
        hasSpeechRef.current = false; setSilenceMs(0);
        isSubmittingRef.current = false;
        setPhase("speaking");
      }
    } catch (e: unknown) {
      isSubmittingRef.current = false;
      setSubmitError(e instanceof Error ? e.message : "Something went wrong.");
      setPhase("listening");
    }
  }, [validationSessionId]);

  // ── Stop + transcribe + submit ────────────────────────────────────────────
  const stopAndSubmit = useCallback(async (skill: string) => {
    if (vadRef.current) { clearInterval(vadRef.current); vadRef.current = null; }
    try { srRef.current?.stop(); } catch { /**/ }
    srRef.current = null;
    const rec = recorderRef.current;
    if (!rec) {
      const text = showTypeInput ? typedAnswer : liveRef.current;
      if (text.trim()) await submitAnswer(text, skill);
      return;
    }
    await new Promise<void>((resolve) => {
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        let finalText = liveRef.current;
        if (finalText.trim().length < 10 && blob.size > 3000) {
          try { const tr = await api.transcribeAudio(blob, validationSessionId); if (tr.ok && tr.transcript) finalText = tr.transcript; } catch { /**/ }
        }
        if (finalText.trim()) { setLiveTranscript(finalText); await submitAnswer(finalText, skill); }
        else { isSubmittingRef.current = false; setShowTypeInput(true); setPhase("no_speech"); }
        resolve();
      };
      rec.stop(); rec.stream.getTracks().forEach((t) => t.stop());
    });
    audioCtxRef.current?.close().catch(() => {}); audioCtxRef.current = null; recorderRef.current = null;
  }, [validationSessionId, submitAnswer, showTypeInput, typedAnswer]);

  // ── Start listening ───────────────────────────────────────────────────────
  const startListening = useCallback(async (skill: string) => {
    setPhase("listening"); setLiveTranscript("");
    hasSpeechRef.current = false; lastSpeechRef.current = 0;
    listenStartRef.current = Date.now(); setSilenceMs(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioCtx = new AudioContext();
      const analyser = audioCtx.createAnalyser(); analyser.fftSize = 512;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      audioCtxRef.current = audioCtx;

      let mimeType = "audio/webm;codecs=opus";
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "audio/webm";
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "";
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.start(250); recorderRef.current = rec;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const W = window as any;
      const SRA = W.SpeechRecognition || W.webkitSpeechRecognition;
      if (SRA) {
        const sr = new SRA(); sr.continuous = true; sr.interimResults = true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sr.onresult = (e: any) => setLiveTranscript(Array.from(e.results as ArrayLike<{0:{transcript:string}}>).map((r) => r[0].transcript).join(" "));
        sr.start(); srRef.current = sr;
      }

      const buf = new Float32Array(analyser.fftSize);
      vadRef.current = setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        const rms = Math.sqrt(buf.reduce((s,v) => s+v*v, 0) / buf.length);
        const now = Date.now();
        if (rms > 0.012) {
          hasSpeechRef.current = true; lastSpeechRef.current = now; setSilenceMs(0);
          setPhase((p) => p === "listening" ? "heard" : p);
        } else if (hasSpeechRef.current) {
          const silentMs = now - lastSpeechRef.current; setSilenceMs(silentMs);
          if (silentMs >= 3500) { clearInterval(vadRef.current!); vadRef.current = null; stopAndSubmit(skill); }
        }
        if (!hasSpeechRef.current && now - listenStartRef.current > 30000) {
          clearInterval(vadRef.current!); vadRef.current = null;
          setShowTypeInput(true);
          setPhase("no_speech");
        }
      }, 200);
    } catch {
      setShowTypeInput(true); setPhase("listening");
    }
  }, [stopAndSubmit]);

  const startListeningRef = useRef(startListening);
  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);

  // ── Mount: load first question ────────────────────────────────────────────
  useEffect(() => {
    const q      = sessionStorage.getItem("unmapped_validation_first_q");
    const skill  = sessionStorage.getItem("unmapped_validation_first_skill");
    const total  = sessionStorage.getItem("unmapped_validation_total_q");
    const skills = sessionStorage.getItem("unmapped_validation_claimed_skills");
    if (q)     setCurrentQuestion(q);
    if (skill) setCurrentSkill(skill);
    if (total) { const n = parseInt(total, 10); setTotalQuestions(n); prevTotalRef.current = n; }
    if (skills) {
      try {
        const parsed: string[] = JSON.parse(skills);
        setSkillMap(parsed.map((s, i) => ({ skill: s, avg_score: 0, questions_asked: 0, verdict: i===0?"TESTING":"PENDING" })));
      } catch { /**/ }
    }
    qStartRef.current = Date.now();
    setPhase("speaking");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Speak → auto-listen (startListeningRef breaks dep cycle) ─────────────
  useEffect(() => {
    if (phase !== "speaking" || !currentQuestion) return;
    let alive = true;
    const t = setTimeout(async () => {
      if (!alive) return;
      const t0 = Date.now();
      await speakText(currentQuestion);
      // If speakText resolved in <300ms the browser likely dropped it silently
      if (Date.now() - t0 < 300) setTtsWorking(false);
      else setTtsWorking(true);
      if (alive) startListeningRef.current(currentSkill);
    }, 0);
    return () => { alive = false; clearTimeout(t); window.speechSynthesis?.cancel(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentQuestion]);

  // ── Camera + face tracking ────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:"user", width:320, height:240 } });
        if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(()=>{}); }
        setCameraActive(true);
        cameraReadyAt.current = Date.now() + 10000; // 10s grace period before any violations
        trackRef.current = setInterval(() => {
          if (!alive || !videoRef.current || !canvasRef.current) return;
          const pos = detectFaceCenter(videoRef.current, canvasRef.current);
          faceHistRef.current.push(pos);
          if (faceHistRef.current.length > 6) faceHistRef.current.shift();
          const detected = faceHistRef.current.filter(Boolean) as FacePos[];
          const facePresent = detected.length >= 2;

          // Only penalise gaze during active answering, and only after grace period
          const canPenalise = Date.now() > cameraReadyAt.current &&
            (phaseRef.current === "listening" || phaseRef.current === "heard");

          if (facePresent) {
            const avgX = detected.reduce((s,f)=>s+f.x,0)/detected.length;
            const avgY = detected.reduce((s,f)=>s+f.y,0)/detected.length;
            setFacePos({ x: avgX, y: avgY });
            setFaceDetected(true);
            const dev = Math.sqrt((avgX-.5)**2+(avgY-.5)**2);
            const vari = detected.reduce((s,f)=>s+(f.x-avgX)**2+(f.y-avgY)**2,0)/detected.length;
            const away = dev > 0.42;
            setFaceStable(!away && vari < 0.05);
            if (away && canPenalise) {
              if (!gazeStartRef.current) gazeStartRef.current = Date.now();
              const secs = (Date.now() - gazeStartRef.current) / 1000;
              gazeAccumRef.current = secs;
              if (secs >= 4 && !stopped) {
                setShowGazeWarn(true);
                setGazeWarnCount((c) => { const n=c+1; if(n>=3) setStopped(true); return n; });
                gazeStartRef.current = Date.now();
              }
            } else if (!away) {
              gazeStartRef.current = null;
            }
          } else {
            setFaceDetected(false); setFacePos(null); setFaceStable(false);
            if (canPenalise) {
              if (!gazeStartRef.current) gazeStartRef.current = Date.now();
              const secs = (Date.now() - gazeStartRef.current) / 1000;
              gazeAccumRef.current = secs;
              if (secs >= 5 && !stopped) {  // longer grace for no-face (maybe poor lighting)
                setShowGazeWarn(true);
                setGazeWarnCount((c) => { const n=c+1; if(n>=3) setStopped(true); return n; });
                gazeStartRef.current = Date.now();
              }
            } else {
              gazeStartRef.current = null; // reset when not in active phase
            }
          }
        }, 333);
      } catch { setCameraActive(false); }
    })();
    return () => {
      alive = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (trackRef.current) clearInterval(trackRef.current);
      window.speechSynthesis?.cancel();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Cheat signals ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onVis  = () => { if (document.hidden) tabRef.current++; };
    const onBlur = () => { focusRef.current++; };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("blur", onBlur); };
  }, []);

  // ── Guards ────────────────────────────────────────────────────────────────
  if (phase === "complete" && result) return <ResultScreen result={result} router={router} />;

  if (stopped) return (
    <main className="min-h-screen mc-bg flex items-center justify-center px-6">
      <div className="mc-panel max-w-md w-full p-8 text-center mc-font">
        <div className="text-5xl mc-text-shadow text-[#ff4040] mb-4">☠</div>
        <h1 className="text-3xl mc-text-shadow text-[#ff4040] mb-3">INTERVIEW TERMINATED</h1>
        <p className="text-[#888] text-lg mb-6">3 gaze violations detected. Session cannot produce a valid certificate.</p>
        <button onClick={() => router.push("/intake")} className="mc-btn-green w-full py-3 text-xl">TRY AGAIN</button>
      </div>
    </main>
  );

  const progress  = totalQuestions > 0 ? Math.round(((questionNumber-1)/totalQuestions)*100) : 0;
  const isActive  = phase === "listening" || phase === "heard";
  const toneScore = toneBySkill[currentSkill] ?? null;

  const handleManualSubmit = () => {
    const text = showTypeInput ? typedAnswer : liveRef.current;
    if (!text.trim()) return;
    if (vadRef.current) { clearInterval(vadRef.current); vadRef.current = null; }
    stopAndSubmit(currentSkill);
  };

  const handleRepeat = async () => {
    if (vadRef.current) { clearInterval(vadRef.current); vadRef.current = null; }
    try { recorderRef.current?.stop(); } catch { /**/ }
    try { srRef.current?.stop(); } catch { /**/ }
    audioCtxRef.current?.close().catch(() => {}); audioCtxRef.current = null; recorderRef.current = null;
    setLiveTranscript(""); setPhase("speaking");
  };

  const verdictMc = justVerdict ? MC_V[justVerdict] : null;

  return (
    <main className="min-h-screen mc-bg mc-font text-[#e0e0e0] flex flex-col">
      <canvas ref={canvasRef} className="hidden" />

      {/* Gaze warning */}
      {showGazeWarn && !stopped && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background:"rgba(0,0,0,0.8)" }}>
          <div className="mc-panel max-w-sm w-full mx-4 p-6 text-center">
            <div className="text-5xl mc-text-shadow text-[#ff4040] mb-3">👁</div>
            <h2 className="text-2xl mc-text-shadow text-[#ff4040] mb-2">LOOK AT SCREEN!</h2>
            <p className="text-[#888] text-lg mb-5">Warning {gazeWarnCount} of 3</p>
            <button onClick={() => setShowGazeWarn(false)} className="mc-btn-green w-full py-3 text-xl">I&apos;M BACK</button>
          </div>
        </div>
      )}

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="mc-panel px-4 py-2 flex items-center gap-3 border-x-0 border-t-0 shrink-0">
        <button onClick={() => router.push("/intake")} className="mc-btn-stone px-3 py-1 text-base shrink-0">← BACK</button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[#f8b700] text-base mc-text-shadow truncate">
              {currentSkill ? `TESTING: ${currentSkill.toUpperCase()}` : "LOADING..."}
            </span>
            <span className="text-[#888] text-sm shrink-0 ml-2">Q {questionNumber}/{totalQuestions||"?"}</span>
          </div>
          <div className="mc-xp-bar">
            <div className="mc-xp-fill transition-all duration-700" style={{ width:`${progress}%` }} />
          </div>
        </div>
        {/* Depth unlock notification */}
        {depthUnlocked && (
          <span className="mc-font text-[#4fd0e4] text-xs mc-text-shadow animate-pulse shrink-0">⬆ DEPTH+</span>
        )}
      </header>

      {/* ── MAIN CONTENT ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 overflow-auto">

        {/* ── LEFT: Camera + integrity ───────────────────────────────────── */}
        <div className="lg:w-72 shrink-0 flex flex-col gap-3">

          {/* Camera feed — video element is ALWAYS mounted so the ref + srcObject never get lost */}
          <div className="mc-panel overflow-hidden" style={{ aspectRatio:"4/3", position:"relative", minHeight:160 }}>
            {/* Single persistent video element — visibility toggled, never unmounted */}
            <video
              ref={videoRef}
              muted playsInline autoPlay
              className="absolute inset-0 w-full h-full object-cover"
              style={{ display: cameraActive ? "block" : "none" }}
            />

            {/* No-camera placeholder */}
            {!cameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl mb-2">📷</span>
                <span className="mc-font text-[#888] text-base">Camera unavailable</span>
                <span className="mc-font text-[#555] text-xs mt-1">Integrity tracking disabled</span>
              </div>
            )}

            {cameraActive && (
              <>
                {/* Face tracking bracket overlay */}
                {faceDetected && facePos && (
                  <div className="absolute pointer-events-none" style={{
                    left: `${Math.max(5,Math.min(75,facePos.x*100-12.5))}%`,
                    top:  `${Math.max(5,Math.min(70,facePos.y*100-12.5))}%`,
                    width: "25%", paddingBottom: "25%",
                  }}>
                    <div className="absolute inset-0">
                      {(["top-0 left-0 border-t-2 border-l-2","top-0 right-0 border-t-2 border-r-2",
                        "bottom-0 left-0 border-b-2 border-l-2","bottom-0 right-0 border-b-2 border-r-2"] as const).map((cls,i) => (
                        <div key={i} className={`absolute w-4 h-4 ${cls}`}
                          style={{ borderColor: faceStable?"#80ff20":"#ffaa44" }} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Status chip */}
                <div className="absolute top-2 right-2 flex items-center gap-1.5 mc-panel-inset px-2 py-0.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: faceDetected?(faceStable?"#80ff20":"#ffaa44"):"#888" }} />
                  <span className="mc-font text-xs" style={{ color: faceDetected?(faceStable?"#80ff20":"#ffaa44"):"#888" }}>
                    {faceDetected?(faceStable?"STABLE":"MOVING"):"SEARCHING"}
                  </span>
                </div>

                {/* Look-at-camera hint only during active phases */}
                {!faceDetected && isActive && (
                  <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center py-1"
                    style={{ background:"rgba(0,0,0,0.6)" }}>
                    <span className="mc-font text-[#ffaa44] text-xs">LOOK AT CAMERA</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Integrity metrics */}
          <div className="mc-panel-inset p-3 flex flex-col gap-2">
            <p className="text-[#888] text-xs tracking-widest">SESSION INTEGRITY</p>
            <div className="flex items-center justify-between">
              <span className="text-[#888] text-xs">GAZE VIOLATIONS</span>
              <span className="mc-text-shadow text-sm" style={{ color: gazeWarnCount===0?"#80ff20":gazeWarnCount===1?"#f8b700":"#ff4040" }}>
                {gazeWarnCount}/3
              </span>
            </div>
            {lastTone && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[#888] text-xs">TONE CONFIDENCE</span>
                  <span className="text-sm mc-text-shadow" style={{ color: lastTone.score>70?"#80ff20":lastTone.score>45?"#f8b700":"#ff4040" }}>
                    {lastTone.score}%
                  </span>
                </div>
                <div className="mc-xp-bar">
                  <div className="mc-xp-fill" style={{ width:`${lastTone.score}%`, background: lastTone.score>70?"#80ff20":lastTone.score>45?"#f8b700":"#ff4040" }} />
                </div>
                {lastTone.wordCount > 0 && <p className="text-[#555] text-xs">{lastTone.wordCount} words · {lastTone.hesitations} hesitation{lastTone.hesitations!==1?"s":""}</p>}
              </>
            )}
          </div>
        </div>

        {/* ── RIGHT: Question + recording ────────────────────────────────── */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">

          {/* Verdict flash */}
          {justSkill && justVerdict && verdictMc && (
            <div className="mc-panel px-4 py-3 flex items-center gap-3" style={{ borderColor: verdictMc.border }}>
              <span className="text-xl">{justVerdict==="STRONG"?"⚔":justVerdict==="ADEQUATE"?"🛡":justVerdict==="WEAK"?"⚠":"✘"}</span>
              <span className="mc-text-shadow" style={{ color: verdictMc.text }}>
                {justSkill.toUpperCase()}: <strong>{justVerdict}</strong>
              </span>
              {depthUnlocked && (
                <span className="ml-auto text-[#4fd0e4] text-sm mc-text-shadow animate-pulse">⬆ DEPTH UNLOCKED</span>
              )}
            </div>
          )}

          {/* Question card — ALWAYS visible once loaded */}
          {currentQuestion && (
            <div className="mc-panel p-5">
              <div className="flex items-center gap-2 mb-3 flex-wrap gap-y-1">
                <div className="text-[#f8b700] text-xs tracking-widest">
                  {phase==="speaking"?"🔊 AI SPEAKING...":phase==="scoring"?"⏳ ANALYSING...":phase==="heard"?"🎙 RECORDING...":phase==="listening"?"🎙 MIC OPEN":"QUESTION"}
                </div>
                <div className="flex-1" />
                {/* Always show replay so user can trigger TTS with a user gesture */}
                <button
                  onClick={() => {
                    if (!currentQuestion) return;
                    window.speechSynthesis?.cancel();
                    setTimeout(() => {
                      doSpeak(currentQuestion, () => {});
                    }, 150);
                  }}
                  className="mc-btn-stone px-3 py-0.5 text-sm"
                >
                  🔊 SPEAK
                </button>
              </div>

              {/* TTS unavailable notice */}
              {!ttsWorking && (
                <div className="mc-panel-inset px-3 py-1.5 mb-3 flex items-center gap-2">
                  <span className="text-[#f8b700] text-xs">⚠ Voice unavailable on this browser — click 🔊 SPEAK or read below</span>
                </div>
              )}

              <p className="mc-font text-xl text-[#e0e0e0] leading-snug" style={{ letterSpacing:".02em" }}>
                {currentQuestion}
              </p>
            </div>
          )}

          {/* Phase indicator */}
          <div className="mc-panel-inset px-4 py-4 flex items-center justify-center min-h-[100px]">
            {phase === "speaking" || phase === "preparing" ? (
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-end gap-1.5 h-10">
                  {[4,10,16,8,20,6,14,5,12].map((h,i) => (
                    <div key={i} className="animate-bounce" style={{ width:5, height:h, background:"#f8b700", animationDelay:`${i*90}ms` }} />
                  ))}
                </div>
                <p className="text-[#f8b700] text-base mc-text-shadow tracking-wide">AI IS SPEAKING — LISTEN...</p>
              </div>
            ) : phase === "scoring" ? (
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor:"#f8b700" }} />
                <span className="text-[#888] text-lg">ANALYSING YOUR ANSWER...</span>
              </div>
            ) : phase === "no_speech" ? (
              <div className="flex flex-col items-center gap-2">
                <span className="text-3xl">🔇</span>
                <p className="text-[#ff6060] text-lg mc-text-shadow">NO SPEECH DETECTED</p>
                <p className="text-[#888] text-sm">Try speaking louder, or use text below</p>
              </div>
            ) : phase === "heard" ? (
              <div className="flex flex-col items-center gap-2">
                <div className="relative">
                  <div className="flex items-center justify-center" style={{ width:56,height:56,background:"#c03030",border:"3px solid #7a0000",boxShadow:"inset -3px -3px 0 #7a0000,inset 3px 3px 0 #ff6060",fontSize:26 }}>🎙️</div>
                  <div className="absolute inset-0 border-2 border-red-400 animate-ping opacity-40" />
                </div>
                <p className="text-[#ff6060] text-lg mc-text-shadow">RECORDING...</p>
                {silenceMs > 0 && silenceMs < 3500 && (
                  <p className="text-[#888] text-sm">Auto-submit in {((3500-silenceMs)/1000).toFixed(1)}s</p>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center justify-center" style={{ width:56,height:56,background:"#3d3d3d",border:"3px solid #1b1b1b",boxShadow:"inset -2px -2px 0 #1b1b1b,inset 2px 2px 0 #8b8b8b",fontSize:26 }}>🎙️</div>
                <p className="text-[#888] text-lg">MIC OPEN — SPEAK YOUR ANSWER</p>
              </div>
            )}
          </div>

          {/* Transcript / text input */}
          {(isActive || phase === "no_speech") && (
            <div className="mc-panel-inset p-4">
              {showTypeInput ? (
                <>
                  <p className="text-[#888] text-xs mb-2 tracking-widest">YOUR ANSWER:</p>
                  <textarea
                    className="w-full mc-font text-base text-[#e0e0e0] placeholder-[#555] px-3 py-2 outline-none resize-none"
                    style={{ background:"#1a1a1a", border:"2px solid #1b1b1b", minHeight:96 }}
                    rows={4}
                    placeholder="Type your answer here..."
                    value={typedAnswer}
                    onChange={(e) => setTypedAnswer(e.target.value)}
                    onPaste={() => pasteRef.current++}
                    autoFocus
                  />
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[#888] text-xs flex-1 tracking-widest">LIVE TRANSCRIPT:</p>
                    {toneScore !== null && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[#888] text-xs">TONE</span>
                        <div className="mc-xp-bar" style={{ width:50 }}>
                          <div className="mc-xp-fill" style={{ width:`${toneScore}%`, background: toneScore>70?"#80ff20":toneScore>45?"#f8b700":"#ff6060" }} />
                        </div>
                        <span className="text-xs mc-text-shadow" style={{ color: toneScore>70?"#80ff20":toneScore>45?"#f8b700":"#ff6060" }}>{toneScore}</span>
                      </div>
                    )}
                  </div>
                  <p className="mc-font text-base leading-snug min-h-[48px]"
                    style={{ color: liveTranscript?"#e0e0e0":"#555" }}>
                    {liveTranscript || (isActive?"Speak now...":"—")}
                  </p>
                </>
              )}
            </div>
          )}

          {/* Controls */}
          <div className="flex gap-2 flex-wrap">
            {(isActive || phase === "no_speech") && !showTypeInput && (
              <button onClick={() => setShowTypeInput(true)} className="mc-btn-stone px-4 py-2 text-base">⌨ TYPE</button>
            )}
            {(isActive || phase === "no_speech") && (showTypeInput || liveTranscript) && (
              <button
                onClick={handleManualSubmit}
                disabled={showTypeInput ? !typedAnswer.trim() : !liveTranscript.trim()}
                className="mc-btn-green flex-1 py-2 text-xl"
              >
                SUBMIT ANSWER →
              </button>
            )}
          </div>

          {submitError && (
            <div className="mc-panel px-4 py-3" style={{ borderColor:"#7a0000" }}>
              <p className="text-[#ff6060]">{submitError}</p>
            </div>
          )}

          {isActive && !showTypeInput && !liveTranscript && (
            <p className="text-center text-[#555] text-base">Mic is open — speak your answer · auto-submits after 2.5s silence</p>
          )}
        </div>
      </div>

      {/* Adaptive depth note only — no skill map during interview */}
      {questionNumber > 2 && (
        <div className="mc-panel border-x-0 border-b-0 py-1.5 text-center" style={{ boxShadow:"none" }}>
          <p className="text-[#888] text-xs">Strong answers unlock depth questions · total updates adaptively</p>
        </div>
      )}
    </main>
  );
}
