"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { api } from "@/lib/api";

const COUNTRIES = [
  { code: "GH", name: "Ghana", emoji: "🇬🇭" },
  { code: "IN", name: "India", emoji: "🇮🇳" },
  { code: "KE", name: "Kenya", emoji: "🇰🇪" },
  { code: "BD", name: "Bangladesh", emoji: "🇧🇩" },
  { code: "NG", name: "Nigeria", emoji: "🇳🇬" },
];

export default function DashboardPage() {
  const router = useRouter();
  const [selectedCountry, setSelectedCountry] = useState("GH");
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.getDashboard(selectedCountry)
      .then((d) => setData(d as Record<string, unknown>))
      .finally(() => setLoading(false));
  }, [selectedCountry]);

  const skillsGap = (data?.skills_gap as { sector: string; demand_score: number; supply_score: number; gap: number }[]) || [];
  const buckets = (data?.bucket_distribution as Record<string, number>) || {};
  const bucketData = [
    { name: "At Risk", value: buckets.AT_RISK || 0, fill: "#EF4444" },
    { name: "Durable", value: buckets.DURABLE || 0, fill: "#22C55E" },
    { name: "Emerging", value: buckets.EMERGING || 0, fill: "#EAB308" },
  ];

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <header className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between">
        <button onClick={() => router.push("/")} className="text-gray-400 hover:text-gray-900 text-sm">← Home</button>
        <span className="text-sm font-semibold text-gray-900">Policymaker Dashboard</span>
        <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">Aggregate View</span>
      </header>

      {/* Country switcher */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white max-w-5xl mx-auto">
        <div className="flex gap-2 flex-wrap">
          {COUNTRIES.map((c) => (
            <button
              key={c.code}
              onClick={() => setSelectedCountry(c.code)}
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                selectedCountry === c.code
                  ? "border-yellow-500 bg-yellow-50 text-yellow-700"
                  : "border-gray-200 text-gray-600 hover:border-gray-400"
              }`}
            >
              {c.emoji} {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : data ? (
          <>
            {/* Top stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard label="Profiles Mapped" value={String(data.total_profiles || 0)} color="text-gray-900" />
              <StatCard label="Total Skills Found" value={String(data.total_skills_mapped || 0)} color="text-yellow-600" />
              <StatCard label="Avg Skills / Person" value={String(data.avg_skills_per_profile || 0)} color="text-blue-600" />
              <StatCard label="Hidden Skills %" value={`${data.hidden_skills_pct || 0}%`} color="text-purple-600" />
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-8">
              {/* Risk distribution chart */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <h3 className="font-semibold mb-4 text-gray-900">Skills Risk Distribution</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={bucketData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="name" stroke="#9CA3AF" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#9CA3AF" tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: "8px", color: "#111827" }}
                      labelStyle={{ color: "#6B7280" }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {bucketData.map((entry, index) => (
                        <rect key={index} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Skills gap */}
              {skillsGap.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                  <h3 className="font-semibold mb-4 text-gray-900">Skills Gap by Sector</h3>
                  <div className="space-y-3">
                    {skillsGap.map((sg, i) => (
                      <div key={i}>
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>{sg.sector}</span>
                          <span className="text-red-600">Gap: {Math.round(sg.gap * 100)}%</span>
                        </div>
                        <div className="flex gap-1 h-3 rounded-full overflow-hidden">
                          <div className="bg-green-400 rounded-l" style={{ width: `${sg.supply_score * 100}%` }} title="Supply" />
                          <div className="bg-red-200 rounded-r flex-1" title="Unmet demand" />
                        </div>
                        <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                          <span>Supply {Math.round(sg.supply_score * 100)}%</span>
                          <span>Demand {Math.round(sg.demand_score * 100)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Policy insight */}
            {data.policy_insight && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 mb-8">
                <h3 className="text-blue-600 font-semibold mb-2 text-sm uppercase tracking-wide">Policy Insight</h3>
                <p className="text-gray-700 text-sm leading-relaxed">{String(data.policy_insight)}</p>
              </div>
            )}

            <p className="text-gray-400 text-xs text-center">
              {String(data.data_note || "")} · ILO ILOSTAT + World Bank WDI
            </p>
          </>
        ) : null}
      </div>
    </main>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 text-center shadow-sm">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-gray-400 text-xs mt-1">{label}</div>
    </div>
  );
}
