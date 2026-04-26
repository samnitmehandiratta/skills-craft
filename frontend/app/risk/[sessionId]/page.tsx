"use client";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { api } from "@/lib/api";
import { ALL_COUNTRIES } from "@/lib/countries";
import type { SkillProfile, RiskAssessment, ResilienceRecommendation, Projections, Skill } from "@/lib/types";

const BUCKET_MC = {
  AT_RISK:  { color: "#ff4040", dim: "#ff404022", border: "#ff404055", label: "AT RISK"  },
  DURABLE:  { color: "#80ff20", dim: "#80ff2022", border: "#80ff2055", label: "DURABLE"  },
  EMERGING: { color: "#f8b700", dim: "#f8b70022", border: "#f8b70055", label: "EMERGING" },
};
const RISK_MC = {
  HIGH:     { color: "#ff4040", glow: "#ff404033" },
  MODERATE: { color: "#f8b700", glow: "#f8b70033" },
  LOW:      { color: "#80ff20", glow: "#80ff2033" },
};

// ── Semicircle gauge ──────────────────────────────────────────────────────────
function RiskGauge({
  pct, overall, label, factor,
}: {
  pct: number; overall: string; label?: string; factor?: number;
}) {
  const R  = 72;
  const cx = 100, cy = 96;
  const C  = Math.PI * R;               // half-circumference
  const arcColor =
    pct >= 60 ? "#ff4040" : pct >= 30 ? "#f8b700" : "#80ff20";
  const filled = (pct / 100) * C;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 110" width="100%" style={{ maxWidth: 220 }}>
        {/* Tick marks at 30% and 60% */}
        {[30, 60].map((t) => {
          const angle = Math.PI - (t / 100) * Math.PI;
          const x1 = cx + (R - 4) * Math.cos(angle);
          const y1 = cy - (R - 4) * Math.sin(angle);
          const x2 = cx + (R + 8) * Math.cos(angle);
          const y2 = cy - (R + 8) * Math.sin(angle);
          return (
            <line key={t} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#2a2a2a" strokeWidth={1.5} />
          );
        })}
        {/* Background arc */}
        <path
          d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
          fill="none" stroke="#1a1a1a" strokeWidth={14} strokeLinecap="butt"
        />
        {/* Colored fill arc */}
        <path
          d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
          fill="none" stroke={arcColor} strokeWidth={14} strokeLinecap="butt"
          strokeDasharray={`${C}`}
          strokeDashoffset={`${C - filled}`}
          style={{ filter: `drop-shadow(0 0 6px ${arcColor}88)` }}
        />
        {/* Zone colors (background segments) */}
        <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R * Math.cos(Math.PI * 0.7)} ${cy - R * Math.sin(Math.PI * 0.7)}`}
          fill="none" stroke="#80ff2011" strokeWidth={14} strokeLinecap="butt" />

        {/* Center: big % number */}
        <text x={cx} y={cy - 18} textAnchor="middle"
          fill={arcColor} fontSize={32} fontFamily="'VT323', monospace"
          style={{ filter: `drop-shadow(0 0 4px ${arcColor}88)` }}>
          {Math.round(pct)}%
        </text>
        <text x={cx} y={cy - 2} textAnchor="middle" fill="#888" fontSize={11}
          fontFamily="'VT323', monospace">AT RISK</text>

        {/* Overall risk label */}
        <text x={cx} y={cy + 13} textAnchor="middle"
          fill={RISK_MC[overall as keyof typeof RISK_MC]?.color ?? arcColor}
          fontSize={15} fontFamily="'VT323', monospace" letterSpacing={2}>
          {overall} RISK
        </text>

        {/* Axis labels */}
        <text x={cx - R - 4} y={cy + 14} textAnchor="end" fill="#999" fontSize={9}
          fontFamily="'VT323', monospace">0%</text>
        <text x={cx + R + 4} y={cy + 14} textAnchor="start" fill="#999" fontSize={9}
          fontFamily="'VT323', monospace">100%</text>
      </svg>
      {label && (
        <div className="mc-font text-xs text-[#bbb] -mt-1">{label}</div>
      )}
      {factor !== undefined && (
        <div className="mc-font text-xs text-[#bbb] mt-0.5">
          Calibration <span style={{ color: "#f8b700" }}>×{factor}</span> vs US
        </div>
      )}
    </div>
  );
}

// ── Skill tag / tile ──────────────────────────────────────────────────────────
function SkillTag({ skill, compSkill }: { skill: Skill; compSkill?: Skill }) {
  const bmc  = BUCKET_MC[skill.bucket as keyof typeof BUCKET_MC] || BUCKET_MC.EMERGING;
  const prob = Math.round((skill.automation_score?.lmic_calibrated_probability || 0) * 100);
  const comp = compSkill
    ? Math.round((compSkill.automation_score?.lmic_calibrated_probability || 0) * 100) : null;

  return (
    <div
      className="mc-font text-sm"
      style={{
        background: bmc.dim,
        border: `1px solid ${bmc.border}`,
        padding: "8px 12px",
        minWidth: 120,
        boxShadow: `0 0 6px ${bmc.color}22`,
      }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[#e0e0e0] truncate">{skill.skill}</span>
        <span className="shrink-0 mc-text-shadow text-xs font-bold" style={{ color: bmc.color }}>{prob}%</span>
      </div>
      {/* Always-visible bar */}
      <div className="h-1 bg-[#111] mb-1">
        <div className="h-full" style={{ width: `${prob}%`, background: bmc.color, boxShadow: `0 0 4px ${bmc.color}88` }} />
      </div>
      {skill.automation_score?.matched_occupation && (
        <p className="text-[10px] text-[#bbb] leading-tight">→ {skill.automation_score.matched_occupation}</p>
      )}
      {comp !== null && (
        <p className="text-[10px] text-[#4fd0e4] mt-0.5">Compare: {comp}%</p>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function RiskPage() {
  const router    = useRouter();
  const params    = useParams();
  const sessionId = params.sessionId as string;

  const [profile,     setProfile]     = useState<SkillProfile | null>(null);
  const [assessment,  setAssessment]  = useState<RiskAssessment | null>(null);
  const [resilience,  setResilience]  = useState<ResilienceRecommendation[]>([]);
  const [projections, setProjections] = useState<Projections | null>(null);
  const [countryCode, setCountryCode] = useState("GH");
  const [loading,     setLoading]     = useState(true);

  const [compSearch,  setCompSearch]  = useState("");
  const [showDrop,    setShowDrop]    = useState(false);
  const [compCC,      setCompCC]      = useState("");
  const [compLoading, setCompLoading] = useState(false);
  const [compAssess,  setCompAssess]  = useState<RiskAssessment | null>(null);
  const [compError,   setCompError]   = useState<string | null>(null);

  const [resOpen,  setResOpen]  = useState(false);
  const [eduOpen,  setEduOpen]  = useState(false);

  useEffect(() => {
    const cc = sessionStorage.getItem("unmapped_country") || "GH";
    const cached = sessionStorage.getItem("unmapped_profile");
    setCountryCode(cc);
    if (!cached) { router.push("/"); return; }
    const p = JSON.parse(cached) as SkillProfile;
    setProfile(p);

    Promise.all([
      api.assessRisk(sessionId, cc, p.skills as object[]),
      api.getProjections(cc),
    ]).then(([risk, proj]) => {
      setAssessment(risk);
      setProjections(proj);
      sessionStorage.setItem("unmapped_assessed_skills", JSON.stringify(risk.assessed_skills));
      return api.getResilience(sessionId);
    }).then((res) => setResilience(res.recommendations))
      .finally(() => setLoading(false));
  }, [sessionId, router]);

  const handleCompare = async (cc: string, name: string) => {
    if (!profile || cc === countryCode) return;
    setCompCC(cc); setCompSearch(name); setShowDrop(false);
    setCompLoading(true); setCompError(null); setCompAssess(null);
    try {
      const res = await api.assessRisk(sessionId, cc, profile.skills as object[]);
      setCompAssess(res);
    } catch {
      setCompError(`${cc} not yet configured.`);
    }
    setCompLoading(false);
  };

  if (loading) return <LoadingScreen />;
  if (!assessment || !profile) return null;

  const total    = assessment.assessed_skills.length || 1;
  const atRiskN  = assessment.assessed_skills.filter((s) => s.bucket === "AT_RISK").length;
  const atRiskPct = Math.round((atRiskN / total) * 100);

  // sorted: AT_RISK first, EMERGING second, DURABLE last
  const sortedSkills = [...assessment.assessed_skills].sort((a, b) => {
    const order = { AT_RISK: 0, EMERGING: 1, DURABLE: 2 };
    return (order[a.bucket as keyof typeof order] ?? 1) - (order[b.bucket as keyof typeof order] ?? 1);
  });

  const chartData = projections ? projections.years.map((y, i) => ({
    year: y,
    tertiary:  projections.tertiary_education_pct[i],
    secondary: projections.secondary_education_pct[i],
  })) : [];

  const filtered = compSearch.trim()
    ? ALL_COUNTRIES.filter(
        (c) =>
          c.name.toLowerCase().includes(compSearch.toLowerCase()) ||
          c.code.toLowerCase().includes(compSearch.toLowerCase())
      )
    : ALL_COUNTRIES;

  return (
    <main className="min-h-screen mc-bg mc-font text-[#e0e0e0]">
      {/* Header */}
      <header className="mc-panel px-5 py-3 flex items-center justify-between border-x-0 border-t-0">
        <button onClick={() => router.push(`/profile/${sessionId}`)} className="mc-btn-stone px-3 py-1 text-base">
          ← PROFILE
        </button>
        <span className="text-[#f8b700] text-xl mc-text-shadow tracking-widest">AI RISK LENS</span>
        <span className="text-[#bbb] text-base">{countryCode}</span>
      </header>

      {/* ── Two-column hero ── */}
      <div className="flex gap-0" style={{ minHeight: "calc(100vh - 52px)" }}>

        {/* LEFT: gauges + controls */}
        <div className="flex-1 border-r border-[#1a1a1a] flex flex-col">

          {/* Primary gauge */}
          <div className="mc-panel p-4 border-x-0 border-t-0 flex flex-col items-center gap-3">
            <RiskGauge
              pct={atRiskPct}
              overall={assessment.summary.overall_risk}
              label={countryCode}
              factor={assessment.calibration_factor}
            />
            {/* Bucket counts */}
            <div className="grid grid-cols-3 gap-1.5 w-full">
              {[
                { n: assessment.summary.at_risk,  color: "#ff4040", l: "RISK" },
                { n: assessment.summary.emerging, color: "#f8b700", l: "NEW" },
                { n: assessment.summary.durable,  color: "#80ff20", l: "SAFE" },
              ].map(({ n, color, l }) => (
                <div key={l} className="mc-panel-inset p-2 text-center">
                  <div className="text-xl mc-text-shadow" style={{ color }}>{n}</div>
                  <div className="text-[9px] text-[#aaa]">{l}</div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-[#aaa] text-center leading-tight px-1">
              {assessment.calibration_note}
            </p>
          </div>

          {/* Country compare */}
          <div className="p-3 border-b border-[#1a1a1a] space-y-2">
            <p className="text-[#bbb] text-[10px] tracking-widest">COMPARE WITH COUNTRY</p>
            <div className="relative">
              <input
                value={compSearch}
                onChange={(e) => { setCompSearch(e.target.value); setShowDrop(true); }}
                onFocus={() => setShowDrop(true)}
                onBlur={() => setTimeout(() => setShowDrop(false), 150)}
                placeholder="Search all countries…"
                className="mc-font text-xs bg-[#111] border border-[#2a2a2a] px-2.5 py-1.5 w-full outline-none text-[#e0e0e0] placeholder-[#333]"
              />
              {showDrop && (
                <ul className="absolute z-50 mt-0.5 w-full bg-[#0d0d0d] border border-[#2a2a2a] max-h-44 overflow-y-auto">
                  {filtered.slice(0, 50).map((c) => (
                    <li key={c.code}>
                      <button
                        onPointerDown={(e) => { e.preventDefault(); handleCompare(c.code, c.name); }}
                        className={`w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-[#1a1a1a] ${c.code === compCC ? "text-[#f8b700]" : "text-[#e0e0e0]"}`}
                      >
                        <span className="text-sm">{c.flag}</span>
                        <span className="mc-font text-xs truncate">{c.name}</span>
                        <span className="ml-auto text-[9px] text-[#aaa] shrink-0">{c.code}</span>
                      </button>
                    </li>
                  ))}
                  {filtered.length > 50 && (
                    <li className="px-3 py-1 text-[#999] text-[10px]">{filtered.length - 50} more — type to filter</li>
                  )}
                </ul>
              )}
            </div>
            {compLoading && <p className="text-[#bbb] text-[10px]">Calculating…</p>}
            {compError   && <p className="text-[#ff6060] text-[10px]">{compError}</p>}
          </div>

          {/* Comparison gauge */}
          {compAssess && !compLoading && (
            <div className="p-3 border-b border-[#1a1a1a] flex flex-col items-center gap-2">
              <RiskGauge
                pct={Math.round(
                  (compAssess.assessed_skills.filter((s) => s.bucket === "AT_RISK").length /
                    (compAssess.assessed_skills.length || 1)) * 100
                )}
                overall={compAssess.summary.overall_risk}
                label={compCC}
                factor={compAssess.calibration_factor}
              />
              <button
                onClick={() => { setCompCC(""); setCompSearch(""); setCompAssess(null); setCompError(null); }}
                className="text-[#999] hover:text-[#ff4040] text-[10px] mc-font"
              >✕ clear comparison</button>
            </div>
          )}

          {/* Education chart (collapsible) */}
          {chartData.length > 0 && projections && (
            <div className="border-b border-[#1a1a1a]">
              <button onClick={() => setEduOpen(!eduOpen)}
                className="w-full px-3 py-2 flex items-center justify-between">
                <span className="text-[10px] text-[#bbb] tracking-widest">EDUCATION 2025–35</span>
                <span className="text-[#999] text-sm">{eduOpen ? "▲" : "▼"}</span>
              </button>
              {eduOpen && (
                <div className="px-2 pb-3">
                  <ResponsiveContainer width="100%" height={110}>
                    <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                      <CartesianGrid strokeDasharray="2 2" stroke="#111" />
                      <XAxis dataKey="year" stroke="#1a1a1a" tick={{ fill: "#aaa", fontSize: 8, fontFamily: "'VT323', monospace" }} />
                      <YAxis stroke="#1a1a1a" tick={{ fill: "#aaa", fontSize: 8, fontFamily: "'VT323', monospace" }} unit="%" />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 0, fontFamily: "'VT323', monospace", fontSize: 10, color: "#e0e0e0" }}
                        labelStyle={{ color: "#f8b700" }}
                      />
                      <Line type="monotone" dataKey="tertiary"  stroke="#f8b700" strokeWidth={1.5} dot={false} name="Tertiary" />
                      <Line type="monotone" dataKey="secondary" stroke="#4fd0e4" strokeWidth={1.5} dot={false} name="Secondary" />
                    </LineChart>
                  </ResponsiveContainer>
                  <p className="text-[9px] text-[#999] mt-1 leading-tight px-1 italic">{projections.key_insight}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: skill tag cloud + resilience + CTA */}
        <div className="flex-1 flex flex-col p-5 gap-5 overflow-y-auto">

          {/* Skill tag cloud */}
          <div className="mc-panel p-5 flex-1">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[#bbb] text-xs tracking-widest">YOUR SKILLS ({assessment.assessed_skills.length})</p>
              {/* Legend */}
              <div className="flex gap-4">
                {Object.entries(BUCKET_MC).map(([k, v]) => {
                  const n = assessment.assessed_skills.filter((s) => s.bucket === k).length;
                  if (!n) return null;
                  return (
                    <div key={k} className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5" style={{ background: v.color, boxShadow: `0 0 5px ${v.color}88` }} />
                      <span className="mc-font text-xs" style={{ color: v.color }}>{v.label} ({n})</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tag wrap cloud */}
            <div className="flex flex-wrap gap-2">
              {sortedSkills.map((s, i) => {
                const comp = compAssess?.assessed_skills.find((cs) => cs.skill === s.skill);
                return <SkillTag key={i} skill={s} compSkill={comp} />;
              })}
            </div>
          </div>

          {/* Resilience (collapsible) */}
          {resilience.length > 0 && (
            <div className="mc-panel" style={{ borderColor: "#80ff2033" }}>
              <button onClick={() => setResOpen(!resOpen)}
                className="w-full px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2" style={{ background: "#80ff20", boxShadow: "0 0 5px #80ff2088" }} />
                  <span className="mc-font text-sm tracking-widest" style={{ color: "#80ff20" }}>RESILIENCE PATHWAYS</span>
                  <span className="mc-panel-inset px-1.5 py-0 text-[10px] text-[#bbb]">{resilience.length} skills</span>
                </div>
                <span className="text-[#bbb]">{resOpen ? "▲" : "▼"}</span>
              </button>
              {resOpen && (
                <div className="px-5 pb-4 grid grid-cols-2 gap-3">
                  {resilience.map((rec, i) => (
                    <div key={i} className="mc-panel-inset p-3">
                      <p className="mc-font text-xs mb-2" style={{ color: "#ff6060" }}>FROM: {rec.at_risk_skill}</p>
                      {rec.adjacent_skills.map((adj, j) => (
                        <div key={j} className="pl-2 border-l border-[#80ff2033] mb-2 last:mb-0">
                          <p className="mc-font text-xs mc-text-shadow" style={{ color: "#80ff20" }}>{adj.skill}</p>
                          <p className="text-[#bbb] text-[10px] leading-tight">{adj.why_durable}</p>
                          <p className="text-[#999] text-[10px]">~{adj.estimated_months} months</p>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => router.push(`/opportunities/${sessionId}`)}
            className="mc-btn-green w-full py-3 text-xl shrink-0"
          >
            FIND OPPORTUNITIES →
          </button>
        </div>
      </div>
    </main>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen mc-bg flex items-center justify-center">
      <div className="mc-panel p-8 text-center">
        <div className="flex items-end gap-1.5 h-8 justify-center mb-3">
          {[4, 10, 6, 14, 8, 4, 12].map((h, i) => (
            <div key={i} className="animate-bounce"
              style={{ width: 5, height: h, background: "#ff4040", animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
        <p className="mc-font text-[#bbb] text-lg">ASSESSING RISK...</p>
      </div>
    </div>
  );
}
