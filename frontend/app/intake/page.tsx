"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { ALL_COUNTRIES, findCountry } from "@/lib/countries";
import type { SkillProfile } from "@/lib/types";

type Phase = "start" | "loading";

interface ExtractedFile {
  name: string;
  status: "uploading" | "done" | "error";
  skills: string[];
  skillCount: number;
}

async function detectCountry(): Promise<string | null> {
  try {
    const res = await fetch("/api/geoip", { signal: AbortSignal.timeout(4000) });
    const d = await res.json();
    if (d.country_code && findCountry(d.country_code)) return d.country_code;
  } catch { /**/ }
  return null;
}

const LOADING_MSGS = [
  "Mining your skills...",
  "Smelting raw data...",
  "Crafting skill profile...",
  "Loading chunks...",
  "Enchanting results...",
];

export default function IntakePage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("start");
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [detecting, setDetecting] = useState(false);

  // Files
  const [files, setFiles] = useState<ExtractedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manual skills
  const [skillsText, setSkillsText] = useState("");

  // Loading state
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MSGS[0]);
  const [loadingDots, setLoadingDots] = useState(0);
  const [startError, setStartError] = useState<string | null>(null);

  // Detect country
  useEffect(() => {
    const user = getUser();
    if (user?.country_code && findCountry(user.country_code)) {
      setCountryCode(user.country_code);
      return;
    }
    setDetecting(true);
    detectCountry()
      .then((c) => { if (c) setCountryCode(c); })
      .finally(() => setDetecting(false));
  }, []);

  // Loading animation
  useEffect(() => {
    if (phase !== "loading") return;
    let i = 0;
    const msgInterval = setInterval(() => {
      i = (i + 1) % LOADING_MSGS.length;
      setLoadingMsg(LOADING_MSGS[i]);
    }, 1800);
    const dotsInterval = setInterval(() => {
      setLoadingDots((d) => (d + 1) % 4);
    }, 400);
    return () => { clearInterval(msgInterval); clearInterval(dotsInterval); };
  }, [phase]);

  const uploadFile = async (file: File) => {
    if (!countryCode) return;
    const entry: ExtractedFile = { name: file.name, status: "uploading", skills: [], skillCount: 0 };
    setFiles((f) => [...f, entry]);
    try {
      const profile = await api.uploadDocument(file, countryCode) as SkillProfile;
      const skills = profile.skills?.map((s) => s.skill).filter(Boolean) ?? [];
      setFiles((f) => f.map((e) =>
        e.name === file.name && e.status === "uploading"
          ? { ...e, status: "done", skills, skillCount: skills.length }
          : e,
      ));
    } catch {
      setFiles((f) => f.map((e) =>
        e.name === file.name && e.status === "uploading"
          ? { ...e, status: "error" }
          : e,
      ));
    }
  };

  const handleStart = async () => {
    if (!countryCode) return;
    setStartError(null);

    // Collect all skills from docs + manual entry
    const docSkills = files.filter((f) => f.status === "done").flatMap((f) => f.skills);
    const manualSkills = skillsText
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);
    const allSkills = [...new Set([...docSkills, ...manualSkills])].slice(0, 20);

    if (!allSkills.length) {
      setStartError("Add at least one skill or upload a document first.");
      return;
    }

    setPhase("loading");
    try {
      const sid = sessionStorage.getItem("unmapped_session") || crypto.randomUUID();
      const res = await api.startValidationInterview(sid, allSkills, countryCode);
      sessionStorage.setItem("unmapped_session", sid);
      sessionStorage.setItem("unmapped_country", countryCode);
      sessionStorage.setItem("unmapped_validation_session",        res.validation_session_id);
      sessionStorage.setItem("unmapped_validation_first_q",        res.first_question);
      sessionStorage.setItem("unmapped_validation_first_skill",    res.skill_being_tested);
      sessionStorage.setItem("unmapped_validation_total_q",        String(res.total_questions));
      sessionStorage.setItem("unmapped_validation_claimed_skills", JSON.stringify(res.claimed_skills));
      router.push(`/validate/interview/${res.validation_session_id}`);
    } catch (e: unknown) {
      setPhase("start");
      setStartError(e instanceof Error ? e.message : "Could not start. Try again.");
    }
  };

  const selectedCountry = countryCode ? findCountry(countryCode) : null;
  const filteredCountries = ALL_COUNTRIES.filter((c) => {
    const q = countrySearch.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
  });

  const docSkillCount = files.filter((f) => f.status === "done").reduce((s, f) => s + f.skillCount, 0);
  const manualSkillCount = skillsText.split(/[\n,]+/).filter((s) => s.trim()).length;
  const totalSkills = [...new Set([
    ...files.filter((f) => f.status === "done").flatMap((f) => f.skills),
    ...skillsText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean),
  ])].length;
  const anyUploading = files.some((f) => f.status === "uploading");
  const canStart = totalSkills > 0 && !anyUploading && !!countryCode;

  // ── Loading screen ────────────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <div className="mc-bg min-h-screen flex flex-col items-center justify-center px-6">
        <div className="mc-panel p-8 max-w-sm w-full text-center">
          {/* Spinning pickaxe */}
          <div className="text-6xl mb-6 animate-spin" style={{ animationDuration: "2s" }}>⛏️</div>
          <p className="mc-font text-2xl text-white mc-text-shadow mb-2">
            {loadingMsg}
          </p>
          <p className="mc-font text-xl text-[#80ff20]">
            {"█".repeat(loadingDots)}{"░".repeat(3 - loadingDots)}
          </p>
          {/* XP bar */}
          <div className="mc-xp-bar mt-6 mb-2">
            <div className="mc-xp-fill animate-pulse" style={{ width: "60%" }} />
          </div>
          <p className="mc-font text-sm text-[#888888]">Loading world data...</p>
        </div>
      </div>
    );
  }

  // ── Main screen ───────────────────────────────────────────────────────────
  return (
    <div className="mc-bg min-h-screen text-[#e0e0e0] flex flex-col">
      {/* ── Header ── */}
      <header className="mc-panel px-4 py-3 flex items-center justify-between shrink-0"
        style={{ borderRadius: 0, borderLeft: 0, borderRight: 0, borderTop: 0 }}>
        <button
          onClick={() => router.push("/")}
          className="mc-font mc-btn-stone px-4 py-1 text-base"
        >
          ← BACK
        </button>
        <span className="mc-font text-xl text-[#f8b700] mc-text-shadow tracking-widest">
          ⚔ SKILLS-CRAFT ⚔
        </span>
        {/* Country badge */}
        {selectedCountry ? (
          <button
            onClick={() => setShowCountryPicker((v) => !v)}
            className="mc-font mc-btn-stone px-3 py-1 text-sm flex items-center gap-1"
          >
            {selectedCountry.flag} {selectedCountry.code}
            {detecting && <span className="text-[#80ff20] text-xs ml-1">•</span>}
          </button>
        ) : (
          <button
            onClick={() => setShowCountryPicker(true)}
            className="mc-font mc-btn-stone px-3 py-1 text-sm"
          >
            {detecting ? "DETECTING..." : "SET REGION"}
          </button>
        )}
      </header>

      {/* ── Country picker dropdown ── */}
      {showCountryPicker && (
        <div className="absolute top-14 right-4 z-50 w-72 mc-panel p-3">
          <input
            type="text"
            placeholder="Search region..."
            value={countrySearch}
            onChange={(e) => setCountrySearch(e.target.value)}
            className="mc-panel-inset w-full mc-font text-sm text-white px-3 py-2 outline-none placeholder-[#666] mb-2"
            style={{ borderRadius: 0 }}
          />
          <div className="max-h-56 overflow-y-auto flex flex-wrap gap-1">
            {filteredCountries.slice(0, 60).map((c) => (
              <button
                key={c.code}
                onClick={() => { setCountryCode(c.code); setShowCountryPicker(false); setCountrySearch(""); }}
                className={`mc-font px-2 py-0.5 text-sm border-2 border-[#1b1b1b] transition ${
                  countryCode === c.code
                    ? "bg-[#5aad1e] text-white"
                    : "bg-[#555555] text-[#e0e0e0] hover:bg-[#666666]"
                }`}
              >
                {c.flag} {c.code}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Hero ── */}
      <div className="text-center px-4 pt-8 pb-6">
        <p className="mc-font text-[#888888] text-lg tracking-widest uppercase mb-1">
          SKILL VALIDATION QUEST
        </p>
        <h1 className="mc-font text-4xl sm:text-5xl text-white mc-text-shadow leading-tight">
          PROVE YOUR<br />
          <span className="text-[#5aad1e]">SKILLS</span>
        </h1>
        <p className="mc-font text-base text-[#888888] mt-2">
          Upload documents or enter your skills · AI validates them in a voice interview
        </p>
      </div>

      {/* ── Two-panel: Upload + Manual ── */}
      <div className="flex-1 px-4 pb-4 max-w-4xl mx-auto w-full">
        <div className="grid md:grid-cols-2 gap-4 mb-5">

          {/* ── LEFT: Document upload ── */}
          <div className="mc-panel p-4 flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">📦</span>
              <span className="mc-font text-xl text-[#f8b700] mc-text-shadow">INVENTORY</span>
              {docSkillCount > 0 && (
                <span className="mc-font text-sm text-[#80ff20] ml-auto">+{docSkillCount} skills</span>
              )}
            </div>
            <p className="mc-font text-sm text-[#888888] mb-3">
              Drop CV, certificates or transcripts. We&apos;ll extract your skills.
            </p>

            {/* Drop zone */}
            <div
              className={`mc-panel-inset flex-1 flex flex-col items-center justify-center min-h-[140px] cursor-pointer transition-all ${
                dragOver ? "brightness-125" : anyUploading ? "" : "hover:brightness-110"
              }`}
              style={{ padding: "24px 16px" }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault(); setDragOver(false);
                Array.from(e.dataTransfer.files).forEach(uploadFile);
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.webp,.txt"
                className="hidden"
                onChange={(e) => { Array.from(e.target.files ?? []).forEach(uploadFile); e.target.value = ""; }}
              />
              {anyUploading ? (
                <>
                  <span className="text-4xl mb-2 animate-bounce">⛏️</span>
                  <span className="mc-font text-[#80ff20]">Mining document...</span>
                </>
              ) : dragOver ? (
                <>
                  <span className="text-4xl mb-2">📥</span>
                  <span className="mc-font text-[#80ff20]">DROP TO PLACE</span>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-1 mb-3">
                    {["📄","📜","🎓","🏆"].map((icon, i) => (
                      <div key={i} className="mc-slot w-10 h-10 flex items-center justify-center text-xl">
                        {icon}
                      </div>
                    ))}
                  </div>
                  <span className="mc-font text-[#888888] text-base text-center">
                    CLICK TO BROWSE
                  </span>
                  <span className="mc-font text-xs text-[#555555] mt-1">
                    PDF · DOCX · JPG · PNG · max 10MB
                  </span>
                </>
              )}
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {files.map((f, i) => (
                  <div key={i} className={`mc-slot flex items-center gap-2 px-3 py-2 ${
                    f.status === "done" ? "border-[#5aad1e]" :
                    f.status === "error" ? "border-[#c03030]" : "border-[#888888]"
                  }`}>
                    <span className="text-base shrink-0">
                      {f.status === "done" ? "✅" : f.status === "error" ? "❌" : "⏳"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="mc-font text-sm text-white truncate">{f.name}</p>
                      <p className={`mc-font text-xs ${
                        f.status === "done" ? "text-[#80ff20]" :
                        f.status === "error" ? "text-[#c03030]" : "text-[#888888]"
                      }`}>
                        {f.status === "done"
                          ? f.skillCount > 0
                            ? `+${f.skillCount} skills found`
                            : "No skills detected"
                          : f.status === "error"
                          ? "Upload failed"
                          : "Extracting..."}
                      </p>
                    </div>
                    {f.status === "done" && f.skillCount > 0 && (
                      <span className="mc-font text-xs text-[#80ff20] shrink-0 bg-[#1a2e0a] px-1.5 py-0.5 border border-[#3d7514]">
                        +{f.skillCount}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── RIGHT: Manual skill entry ── */}
          <div className="mc-panel p-4 flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">✍️</span>
              <span className="mc-font text-xl text-[#4fd0e4] mc-text-shadow">SKILL BOOK</span>
              {manualSkillCount > 0 && (
                <span className="mc-font text-sm text-[#4fd0e4] ml-auto">{manualSkillCount} skills</span>
              )}
            </div>
            <p className="mc-font text-sm text-[#888888] mb-3">
              List skills one per line or comma-separated. Be specific.
            </p>

            <textarea
              className="mc-panel-inset flex-1 w-full mc-font text-sm text-white placeholder-[#555] px-3 py-3 outline-none resize-none min-h-[180px]"
              style={{ borderRadius: 0 }}
              placeholder={"Mobile phone repair\nCustomer negotiation\nInventory tracking\nBasic accounting\nWelding"}
              value={skillsText}
              onChange={(e) => setSkillsText(e.target.value)}
            />

            {/* Skill slot preview */}
            {manualSkillCount > 0 && (
              <div className="mt-3">
                <p className="mc-font text-xs text-[#555] mb-1.5 uppercase tracking-widest">Skill slots loaded:</p>
                <div className="flex flex-wrap gap-1">
                  {skillsText.split(/[\n,]+/).filter((s) => s.trim()).slice(0, 12).map((skill, i) => (
                    <span
                      key={i}
                      className="mc-font text-xs px-2 py-0.5 text-[#4fd0e4]"
                      style={{
                        background: "#0a1e2a",
                        border: "2px solid #1b3d4f",
                        boxShadow: "inset 1px 1px 0 #1a4a5e, inset -1px -1px 0 #0a1520",
                      }}
                    >
                      {skill.trim()}
                    </span>
                  ))}
                  {manualSkillCount > 12 && (
                    <span className="mc-font text-xs text-[#888] px-2 py-0.5">+{manualSkillCount - 12} more</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Skill count summary ── */}
        {totalSkills > 0 && (
          <div className="mc-panel px-4 py-3 mb-4 flex items-center justify-between">
            <div>
              <span className="mc-font text-base text-[#f8b700] mc-text-shadow">
                ⭐ {totalSkills} SKILL{totalSkills !== 1 ? "S" : ""} READY TO VALIDATE
              </span>
              <div className="mc-xp-bar mt-1.5" style={{ width: "200px" }}>
                <div className="mc-xp-fill" style={{ width: `${Math.min(100, (totalSkills / 20) * 100)}%` }} />
              </div>
            </div>
            <span className="mc-font text-sm text-[#888]">{totalSkills}/20 slots</span>
          </div>
        )}

        {/* ── Error ── */}
        {startError && (
          <div className="mc-panel mb-4 px-4 py-3 border-[#c03030]"
            style={{ borderColor: "#c03030", boxShadow: "inset 2px 2px 0 #8b0000, inset -2px -2px 0 #ff4444" }}>
            <p className="mc-font text-[#ff6666] mc-text-shadow">{startError}</p>
          </div>
        )}

        {/* ── No country warning ── */}
        {!countryCode && (
          <div className="mc-panel mb-4 px-4 py-3">
            <p className="mc-font text-[#f8b700] mc-text-shadow text-base">
              ⚠ SELECT YOUR REGION FIRST (top right)
            </p>
          </div>
        )}

        {/* ── CTA ── */}
        <button
          onClick={handleStart}
          disabled={!canStart}
          className="mc-btn-green w-full py-4 text-2xl tracking-widest uppercase"
        >
          {anyUploading ? "⏳ MINING DOCUMENTS..." : "▶ BEGIN VALIDATION QUEST"}
        </button>

        {!totalSkills && (
          <p className="mc-font text-center text-[#555] text-sm mt-2">
            Upload a document or enter skills above to begin
          </p>
        )}

        {/* ── What happens next ── */}
        <div className="mc-panel mt-5 px-4 py-4">
          <p className="mc-font text-[#f8b700] mc-text-shadow text-base mb-3 uppercase tracking-wider">
            📖 Quest Guide
          </p>
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              { icon: "📋", step: "Step I", title: "Upload or List", desc: "Add your CV or type your skills above" },
              { icon: "🎤", step: "Step II", title: "AI Interview", desc: "Answer 2 targeted questions per skill by voice or text" },
              { icon: "🏆", step: "Step III", title: "Skill Certificate", desc: "Get a verified skill profile with automation risk analysis" },
            ].map((s) => (
              <div key={s.step} className="mc-slot px-3 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{s.icon}</span>
                  <span className="mc-font text-xs text-[#888] uppercase tracking-wider">{s.step}</span>
                </div>
                <p className="mc-font text-base text-white mc-text-shadow">{s.title}</p>
                <p className="mc-font text-xs text-[#666] mt-0.5">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
