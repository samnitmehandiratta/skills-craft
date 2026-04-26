"use client";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import type { Opportunity, LaborSignals } from "@/lib/types";

export default function OpportunitiesPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [signals, setSignals] = useState<LaborSignals | null>(null);
  const [countryCode, setCountryCode] = useState("GH");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cc = sessionStorage.getItem("unmapped_country") || "GH";
    setCountryCode(cc);

    const cachedAssessed = sessionStorage.getItem("unmapped_assessed_skills");
    const assessedSkills: object[] | undefined = cachedAssessed ? JSON.parse(cachedAssessed) : undefined;

    api.matchOpportunities(sessionId, cc, assessedSkills)
      .then((res) => {
        setOpportunities(res.opportunities);
        setSignals(res.labor_signals as unknown as LaborSignals);
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) return <LoadingScreen />;

  return (
    <main className="min-h-screen mc-bg mc-font text-[#e0e0e0]">
      {/* Header */}
      <header className="mc-panel px-5 py-3 flex items-center justify-between border-x-0 border-t-0">
        <button onClick={() => router.push(`/risk/${sessionId}`)} className="mc-btn-stone px-3 py-1 text-base">
          ← RISK
        </button>
        <span className="text-[#f8b700] text-xl mc-text-shadow tracking-widest">OPPORTUNITIES</span>
        <span className="text-[#aaa] text-base">{countryCode}</span>
      </header>

      <div className="max-w-4xl mx-auto px-5 py-6 space-y-5">

        {/* Labor market signals */}
        {signals && (
          <div className="mc-panel p-5">
            <p className="text-[#888] text-xs tracking-widest mb-1">REAL LABOR MARKET SIGNALS</p>
            <p className="text-[#999] text-[10px] mb-4">Source: ILO ILOSTAT &amp; World Bank WDI</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {signals.youth_unemployment_rate != null && (
                <StatTile label="YOUTH UNEMPLOYMENT" value={`${signals.youth_unemployment_rate}%`} color="#ff4040" />
              )}
              {signals.informal_employment_pct != null && (
                <StatTile label="INFORMAL ECONOMY" value={`${signals.informal_employment_pct}%`} color="#f8b700" />
              )}
              {signals.gdp_per_capita_usd != null && (
                <StatTile label="GDP PER CAPITA" value={`$${signals.gdp_per_capita_usd?.toLocaleString()}`} color="#4fd0e4" />
              )}
              {signals.human_capital_index != null && (
                <StatTile label="HUMAN CAPITAL INDEX" value={signals.human_capital_index?.toString()} color="#80ff20" />
              )}
            </div>
          </div>
        )}

        {/* Section header */}
        <div className="flex items-center justify-between">
          <span className="text-[#e0e0e0] text-lg tracking-widest">
            MATCHED OPPORTUNITIES <span className="text-[#555]">({opportunities.length})</span>
          </span>
          <span className="text-[#999] text-[10px]">Wages from ILO ILOSTAT</span>
        </div>

        {/* Opportunity cards */}
        <div className="space-y-3">
          {opportunities.map((opp, i) => (
            <OppCard key={i} opp={opp} />
          ))}
        </div>

        <button
          onClick={() => router.push("/dashboard")}
          className="w-full mc-btn-stone py-3 text-xl"
        >
          VIEW POLICYMAKER DASHBOARD →
        </button>
      </div>
    </main>
  );
}

function StatTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="mc-panel-inset p-3 text-center">
      <div className="text-2xl mc-text-shadow mb-1" style={{ color, textShadow: `0 0 8px ${color}66` }}>
        {value}
      </div>
      <div className="text-[#aaa] text-[10px] tracking-widest">{label}</div>
    </div>
  );
}

const OPP_COLOR: Record<string, string> = {
  formal_employment:   "#80ff20",
  informal_employment: "#f8b700",
  entrepreneurship:    "#4fd0e4",
  upskilling:          "#ff4040",
};

function OppCard({ opp }: { opp: Opportunity }) {
  const matchPct = Math.round(opp.match_score * 100);
  const color = OPP_COLOR[opp.opportunity_type] || "#f8b700";

  return (
    <div className="mc-panel p-4" style={{ borderColor: `${color}33` }}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="text-[#f8b700] text-lg mc-text-shadow">{opp.sector}</div>
          <div className="text-[#555] text-xs tracking-widest mt-0.5"
            style={{ color }}>
            {opp.opportunity_type.replace(/_/g, " ").toUpperCase()}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="mc-text-shadow text-base" style={{ color: "#f8b700" }}>{opp.wage_label}</div>
          <div className="text-xs mt-0.5" style={{ color: "#80ff20" }}>{opp.sector_growth_label}</div>
        </div>
      </div>

      {/* Match bar */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 h-2 bg-[#111]">
          <div
            className="h-full"
            style={{ width: `${Math.min(matchPct, 100)}%`, background: color, boxShadow: `0 0 6px ${color}66` }}
          />
        </div>
        <span className="mc-font text-xs shrink-0" style={{ color }}>{matchPct}% MATCH</span>
      </div>

      {/* Matched skills */}
      {opp.matched_skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {opp.matched_skills.map((s, j) => (
            <span key={j} className="mc-font text-[10px] px-2 py-0.5 mc-panel-inset text-[#888]">{s}</span>
          ))}
        </div>
      )}

      <p className="text-[#888] text-[10px] tracking-widest">{opp.data_source}</p>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen mc-bg flex items-center justify-center">
      <div className="mc-panel p-8 text-center">
        <div className="flex items-end gap-1.5 h-8 justify-center mb-3">
          {[4, 10, 6, 14, 8, 4, 12].map((h, i) => (
            <div key={i} className="animate-bounce"
              style={{ width: 5, height: h, background: "#80ff20", animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
        <p className="mc-font text-[#888] text-lg">MATCHING OPPORTUNITIES...</p>
        <p className="mc-font text-[#999] text-xs mt-1">ILO ILOSTAT · WORLD BANK WDI</p>
      </div>
    </div>
  );
}
