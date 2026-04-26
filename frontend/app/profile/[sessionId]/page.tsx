"use client";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, Cell,
  ResponsiveContainer, Tooltip,
} from "recharts";
import type { SkillProfile, Skill } from "@/lib/types";
import { isLoggedIn } from "@/lib/auth";
import { api } from "@/lib/api";

const BUCKET_MC: Record<string, { color: string; label: string; bg: string }> = {
  AT_RISK:  { color: "#ff4040", label: "AT RISK",  bg: "#3a0000" },
  DURABLE:  { color: "#80ff20", label: "DURABLE",  bg: "#0a2000" },
  EMERGING: { color: "#f8b700", label: "EMERGING", bg: "#2a1e00" },
};

const CATEGORY_ICONS: Record<string, string> = {
  technical: "⚙", soft: "🤝", language: "💬", domain: "📦", tool: "🔧", other: "✦",
};

function SkillSlot({ skill }: { skill: Skill }) {
  const [expanded, setExpanded] = useState(false);
  const bmc = skill.bucket ? BUCKET_MC[skill.bucket] : null;
  const conf = skill.confidence !== undefined ? Math.round(skill.confidence * 100) : null;

  return (
    <div
      className="mc-slot p-3 cursor-pointer"
      style={{ borderColor: bmc ? bmc.color + "66" : undefined }}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-2">
        <span className="text-base shrink-0">{CATEGORY_ICONS[skill.category] || "✦"}</span>
        <span className="mc-font text-[#e0e0e0] text-base flex-1 truncate">{skill.skill}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {skill.is_hidden && (
            <span className="mc-font text-xs px-1.5 py-0 mc-panel-inset" style={{ color: "#c084fc" }}>HIDDEN</span>
          )}
          {bmc && (
            <span className="mc-font text-xs px-1.5 py-0 mc-panel-inset mc-text-shadow" style={{ color: bmc.color }}>
              {bmc.label}
            </span>
          )}
          {conf !== null && (
            <span className="mc-font text-xs" style={{ color: conf >= 70 ? "#80ff20" : conf >= 40 ? "#f8b700" : "#ff4040" }}>
              {conf}%
            </span>
          )}
        </div>
      </div>

      {/* Confidence mini-bar */}
      {conf !== null && (
        <div className="mc-xp-bar mt-2" style={{ height: 6 }}>
          <div
            className="mc-xp-fill"
            style={{
              width: `${conf}%`,
              background: conf >= 70 ? "#80ff20" : conf >= 40 ? "#f8b700" : "#ff4040",
              boxShadow: `0 0 4px ${conf >= 70 ? "#80ff2088" : conf >= 40 ? "#f8b70088" : "#ff404088"}`,
            }}
          />
        </div>
      )}

      {expanded && (
        <div className="mt-2 pt-2 border-t border-[#2a2a2a] space-y-1">
          {skill.evidence && (
            <p className="mc-font text-xs text-[#bbb]">Evidence: <span className="text-[#aaa]">{skill.evidence}</span></p>
          )}
          {skill.source_activity && (
            <p className="mc-font text-xs text-[#bbb]">Inferred from: <span className="text-[#aaa]">{skill.source_activity}</span></p>
          )}
          {skill.esco_label && skill.esco_label !== skill.skill && (
            <p className="mc-font text-xs" style={{ color: "#4fd0e4" }}>ESCO: {skill.esco_label}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const router    = useRouter();
  const params    = useParams();
  const sessionId = params.sessionId as string;
  const [profile,    setProfile]    = useState<SkillProfile | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    const cached = sessionStorage.getItem("unmapped_profile");
    if (cached) {
      const p = JSON.parse(cached) as SkillProfile;
      setProfile(p);
      if (isLoggedIn()) {
        setSaveStatus("saving");
        const validationJson = sessionStorage.getItem("unmapped_validation_result") ?? undefined;
        api.saveProfile(sessionId, cached, validationJson)
          .then(() => setSaveStatus("saved"))
          .catch(() => setSaveStatus("error"));
      }
    } else {
      router.push("/");
    }
  }, [router, sessionId]);

  const handleRetrySave = async () => {
    if (!profile || saveStatus === "saving" || saveStatus === "saved") return;
    setSaveStatus("saving");
    try {
      const cached = sessionStorage.getItem("unmapped_profile") ?? JSON.stringify(profile);
      const validationJson = sessionStorage.getItem("unmapped_validation_result") ?? undefined;
      await api.saveProfile(sessionId, cached, validationJson);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  };

  if (!profile) return <LoadingScreen />;

  const explicit = profile.skills.filter((s) => !s.is_hidden);
  const hidden   = profile.skills.filter((s) => s.is_hidden);
  const atRisk   = profile.skills.filter((s) => s.bucket === "AT_RISK").length;
  const durable  = profile.skills.filter((s) => s.bucket === "DURABLE").length;

  // Radar data: average confidence per category
  const categoryAccum: Record<string, { total: number; count: number }> = {};
  for (const s of profile.skills) {
    const cat = (s.category || "other").toLowerCase();
    if (!categoryAccum[cat]) categoryAccum[cat] = { total: 0, count: 0 };
    categoryAccum[cat].total += (s.confidence ?? 0.5) * 100;
    categoryAccum[cat].count += 1;
  }
  const radarData = Object.entries(categoryAccum).map(([cat, { total, count }]) => ({
    category: cat.toUpperCase(),
    value: Math.round(total / count),
    count,
    fullMark: 100,
  }));

  return (
    <main className="min-h-screen mc-bg mc-font text-[#e0e0e0]">
      {/* Header */}
      <header className="mc-panel px-5 py-3 flex items-center justify-between border-x-0 border-t-0">
        <button onClick={() => router.push("/")} className="mc-btn-stone px-3 py-1 text-base">← HOME</button>
        <span className="text-[#f8b700] text-xl mc-text-shadow tracking-widest">SKILL PROFILE</span>
        <div className="flex items-center gap-2 text-sm">
          {saveStatus === "saving" && <span className="text-[#bbb]">SAVING...</span>}
          {saveStatus === "saved"  && <span className="mc-text-shadow" style={{ color: "#80ff20" }}>SAVED ✓</span>}
          {saveStatus === "error"  && (
            <button onClick={handleRetrySave} className="mc-btn-stone px-2 py-0.5 text-xs">RETRY SAVE</button>
          )}
          <span className="text-[#bbb]">{profile.country.name || profile.country.code}</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-5 py-6 space-y-5">

        {/* Summary panel */}
        <div className="mc-panel p-5">
          <p className="text-[#bbb] text-xs tracking-widest mb-2">PROFILE SUMMARY</p>
          <p className="text-[#e0e0e0] text-base leading-relaxed">{profile.summary}</p>

          {/* Stat grid */}
          <div className="grid grid-cols-3 gap-3 mt-5">
            {[
              { val: profile.skill_counts.total,    label: "TOTAL SKILLS", color: "#e0e0e0" },
              { val: profile.skill_counts.explicit,  label: "DESCRIBED",    color: "#f8b700" },
              { val: profile.skill_counts.hidden,    label: "HIDDEN FOUND", color: "#c084fc" },
            ].map(({ val, label, color }) => (
              <div key={label} className="mc-panel-inset p-3 text-center">
                <div className="text-3xl mc-text-shadow" style={{ color }}>{val}</div>
                <div className="text-[#bbb] text-xs mt-1">{label}</div>
              </div>
            ))}
          </div>

          {/* Risk summary bar */}
          {(atRisk > 0 || durable > 0) && (
            <div className="flex gap-4 mt-4 pt-4 border-t border-[#2a2a2a]">
              {atRisk > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 mc-panel-inset" style={{ background: "#3a0000", border: "2px solid #ff4040" }} />
                  <span className="text-xs" style={{ color: "#ff4040" }}>{atRisk} AT RISK</span>
                </div>
              )}
              {durable > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3" style={{ background: "#80ff20" }} />
                  <span className="text-xs" style={{ color: "#80ff20" }}>{durable} DURABLE</span>
                </div>
              )}
              <span className="text-[#bbb] text-xs ml-auto">ESCO v1.1 taxonomy</span>
            </div>
          )}
        </div>

        {/* Portable badge */}
        <div className="flex items-center gap-2 text-xs">
          <div className="w-2 h-2" style={{ background: "#80ff20", boxShadow: "0 0 6px #80ff2088" }} />
          <span className="text-[#bbb]">Portable profile · Grounded in ESCO v1.1 / O*NET taxonomy · Exportable</span>
        </div>

        {/* Spider / Radar chart */}
        {radarData.length >= 3 && (
          <div className="mc-panel p-5">
            <p className="text-[#bbb] text-xs tracking-widest mb-1">SKILL RADAR</p>
            <p className="text-[#bbb] text-xs mb-4">Average confidence by skill category</p>
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                <PolarGrid stroke="#2a2a2a" />
                <PolarAngleAxis
                  dataKey="category"
                  tick={{ fill: "#888", fontSize: 11, fontFamily: "'VT323', monospace" }}
                />
                <PolarRadiusAxis
                  angle={30}
                  domain={[0, 100]}
                  tick={{ fill: "#bbb", fontSize: 9, fontFamily: "'VT323', monospace" }}
                  tickCount={4}
                  stroke="#2a2a2a"
                />
                <Radar
                  name="Confidence"
                  dataKey="value"
                  stroke="#80ff20"
                  fill="#80ff20"
                  fillOpacity={0.18}
                  strokeWidth={2}
                  dot={{ fill: "#f8b700", r: 4, strokeWidth: 0 }}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1a1a1a", border: "2px solid #2a2a2a", borderRadius: 0, fontFamily: "'VT323', monospace", color: "#e0e0e0" }}
                  formatter={(val, _, entry) => [`${val ?? 0}% avg · ${(entry as { payload?: { count?: number } }).payload?.count ?? 0} skills`, ""]}
                  labelStyle={{ color: "#f8b700" }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Skills bar chart */}
        {profile.skills.length > 0 && (
          <SkillBarChart skills={profile.skills} />
        )}

        {/* Skills grid */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Explicit skills */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3" style={{ background: "#f8b700" }} />
              <span className="text-[#f8b700] text-base tracking-widest">SKILLS YOU DESCRIBED</span>
            </div>
            <div className="space-y-2">
              {explicit.length > 0
                ? explicit.map((s, i) => <SkillSlot key={i} skill={s} />)
                : <p className="text-[#bbb] text-sm mc-panel-inset p-3">No explicit skills recorded.</p>
              }
            </div>
          </div>

          {/* Hidden skills */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3" style={{ background: "#c084fc" }} />
              <span className="text-base tracking-widest" style={{ color: "#c084fc" }}>HIDDEN SKILLS FOUND</span>
            </div>
            <p className="text-[#bbb] text-xs mb-3">Inferred from your activities — click any skill to see why.</p>
            <div className="space-y-2">
              {hidden.length > 0
                ? hidden.map((s, i) => <SkillSlot key={i} skill={s} />)
                : <p className="text-[#bbb] text-sm mc-panel-inset p-3">No hidden skills detected yet.</p>
              }
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 flex-wrap pt-2">
          <button
            onClick={() => router.push(`/risk/${sessionId}`)}
            className="mc-btn-green flex-1 py-3 text-xl"
          >
            SEE AUTOMATION RISK →
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="mc-btn-stone px-5 py-3 text-base"
          >
            POLICY VIEW
          </button>
          {!isLoggedIn() && (
            <button
              onClick={() => router.push(`/auth?redirect=/profile/${sessionId}`)}
              className="mc-btn-stone px-5 py-3 text-base"
              style={{ color: "#f8b700" }}
            >
              LOGIN TO SAVE →
            </button>
          )}
        </div>

      </div>
    </main>
  );
}

function SkillBarChart({ skills }: { skills: Skill[] }) {
  const sorted = [...skills]
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, 20); // cap at 20 bars so chart stays readable

  const barData = sorted.map((s) => ({
    name: s.skill.length > 22 ? s.skill.slice(0, 20) + "…" : s.skill,
    fullName: s.skill,
    value: Math.round((s.confidence ?? 0) * 100),
    hidden: s.is_hidden,
    bucket: s.bucket,
  }));

  const barColor = (d: { hidden: boolean; bucket?: string }) => {
    if (d.bucket === "AT_RISK")  return "#ff4040";
    if (d.bucket === "DURABLE")  return "#80ff20";
    if (d.bucket === "EMERGING") return "#f8b700";
    return d.hidden ? "#c084fc" : "#f8b700";
  };

  const chartHeight = Math.max(180, barData.length * 30 + 40);

  return (
    <div className="mc-panel p-5">
      <p className="text-[#bbb] text-xs tracking-widest mb-1">SKILL CONFIDENCE CHART</p>
      <p className="text-[#bbb] text-xs mb-4">All skills sorted by confidence · top {barData.length}</p>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-4">
        {[
          { color: "#f8b700", label: "Described" },
          { color: "#c084fc", label: "Hidden" },
          { color: "#80ff20", label: "Durable" },
          { color: "#ff4040", label: "At Risk" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-3 h-2" style={{ background: color }} />
            <span className="mc-font text-xs text-[#bbb]">{label}</span>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={barData}
          layout="vertical"
          margin={{ top: 0, right: 48, bottom: 0, left: 8 }}
          barCategoryGap={6}
        >
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fill: "#bbb", fontSize: 10, fontFamily: "'VT323', monospace" }}
            tickCount={6}
            tickFormatter={(v) => `${v}%`}
            stroke="#2a2a2a"
          />
          <YAxis
            type="category"
            dataKey="name"
            width={130}
            tick={{ fill: "#888", fontSize: 11, fontFamily: "'VT323', monospace" }}
            stroke="none"
          />
          <Tooltip
            cursor={{ fill: "#ffffff08" }}
            contentStyle={{
              backgroundColor: "#1a1a1a", border: "2px solid #2a2a2a",
              borderRadius: 0, fontFamily: "'VT323', monospace", color: "#e0e0e0",
            }}
            formatter={(val, _, entry) => [
              `${val}%`,
              (entry.payload as { hidden: boolean }).hidden ? "Hidden skill" : "Described skill",
            ]}
            labelFormatter={(_, payload) =>
              (payload?.[0]?.payload as { fullName?: string })?.fullName ?? ""
            }
            labelStyle={{ color: "#f8b700" }}
          />
          <Bar dataKey="value" radius={0} maxBarSize={18}>
            {barData.map((d, i) => (
              <Cell
                key={i}
                fill={barColor(d)}
                style={{ filter: `drop-shadow(0 0 4px ${barColor(d)}55)` }}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen mc-bg flex items-center justify-center">
      <div className="mc-panel p-8 text-center">
        <div className="flex items-end gap-1.5 h-8 justify-center mb-3">
          {[4,8,12,6,10,4,8].map((h, i) => (
            <div key={i} className="animate-bounce" style={{ width: 5, height: h, background: "#f8b700", animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
        <p className="mc-font text-[#bbb] text-lg">LOADING PROFILE...</p>
      </div>
    </div>
  );
}
