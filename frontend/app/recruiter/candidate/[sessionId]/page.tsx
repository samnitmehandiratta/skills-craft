"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { clearRecruiterToken } from "@/lib/recruiterAuth";
import type { RecruiterCandidateDetail, Skill } from "@/lib/types";

function topSkills(skills: Skill[], limit = 30): Skill[] {
  const sorted = [...skills].sort((a, b) => {
    const ac = typeof a.confidence === "number" ? a.confidence : (a.is_hidden ? 0.5 : 1);
    const bc = typeof b.confidence === "number" ? b.confidence : (b.is_hidden ? 0.5 : 1);
    return bc - ac;
  });
  return sorted.slice(0, limit);
}

export default function RecruiterCandidatePage() {
  const router = useRouter();
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;

  const [data, setData] = useState<RecruiterCandidateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.recruiterGetCandidate(sessionId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (e instanceof ApiError) {
          setError(e.message);
          if (e.status === 401) {
            clearRecruiterToken();
            router.push("/recruiter/login");
          }
        } else {
          setError("Failed to load candidate.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router, sessionId]);

  const skills = useMemo(() => (data?.profile?.skills ?? []), [data]);
  const top = useMemo(() => topSkills(skills, 40), [skills]);

  return (
    <main className="min-h-screen mc-bg text-[#e0e0e0] mc-font">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
          <div className="mc-font text-3xl mc-text-shadow text-[#f8b700] tracking-widest">
            CANDIDATE PROFILE
          </div>
          <button onClick={() => router.push("/recruiter/hiring")} className="mc-btn-stone px-4 py-2 text-xl tracking-widest">
            BACK
          </button>
        </div>

        {loading && <div className="mc-panel p-5">Loading…</div>}
        {error && <div className="mc-panel p-5 text-[#c03030]">{error}</div>}

        {data && (
          <div className="grid gap-6">
            <section className="mc-panel p-5">
              <div className="mc-font text-[#4fd0e4] text-2xl">
                {data.name || "Candidate"} {data.phone ? <span className="text-[#888888]">· {data.phone}</span> : null}
              </div>
              <div className="mc-font text-[#888888] mt-1">
                Session: {data.session_id} · Country: {data.country_code || "—"} · Created: {data.created_at}
              </div>
              <div className="mt-3 mc-font text-[#e0e0e0]">
                {data.profile.summary}
              </div>
            </section>

            <section className="mc-panel p-5">
              <div className="mc-font text-[#80ff20] text-xl mc-text-shadow mb-3">TOP SKILLS</div>
              <div className="flex flex-wrap gap-2">
                {top.map((s) => (
                  <span key={`${s.skill}-${s.is_hidden ? "h" : "e"}`} className="mc-slot px-2 py-1 text-sm">
                    {s.skill}{" "}
                    <span className="text-[#888888]">
                      ({s.category}{s.is_hidden ? ", hidden" : ""})
                    </span>
                  </span>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

