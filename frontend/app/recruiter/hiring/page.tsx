"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { RecruiterCandidate, RecruiterShortlistItem } from "@/lib/types";
import { clearRecruiterToken, isRecruiterLoggedIn } from "@/lib/recruiterAuth";

const STORAGE_KEY = "recruiter_hiring_state_v1";

function parseSkills(raw: string): string[] {
  return raw
    .split(/[\n,]/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
}

export default function RecruiterHiringPage() {
  const router = useRouter();

  const [jobTitle, setJobTitle] = useState("");
  const [skillsRaw, setSkillsRaw] = useState("");
  const [minRating, setMinRating] = useState(0);
  const [includeHidden, setIncludeHidden] = useState(true);
  const [onlyMatched, setOnlyMatched] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<RecruiterCandidate[]>([]);
  const [scanned, setScanned] = useState<number>(0);
  const [shortlist, setShortlist] = useState<RecruiterShortlistItem[]>([]);
  const [shortlistError, setShortlistError] = useState<string | null>(null);

  const postedSkills = useMemo(() => parseSkills(skillsRaw), [skillsRaw]);

  useEffect(() => {
    if (!isRecruiterLoggedIn()) router.push("/recruiter/login");
  }, [router]);

  // Restore previous state (so Back doesn't wipe the page).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as Partial<{
        jobTitle: string;
        skillsRaw: string;
        minRating: number;
        includeHidden: boolean;
        onlyMatched: boolean;
        candidates: RecruiterCandidate[];
        scanned: number;
      }>;
      if (typeof s.jobTitle === "string") setJobTitle(s.jobTitle);
      if (typeof s.skillsRaw === "string") setSkillsRaw(s.skillsRaw);
      if (typeof s.minRating === "number") setMinRating(s.minRating);
      if (typeof s.includeHidden === "boolean") setIncludeHidden(s.includeHidden);
      if (typeof s.onlyMatched === "boolean") setOnlyMatched(s.onlyMatched);
      if (Array.isArray(s.candidates)) setCandidates(s.candidates);
      if (typeof s.scanned === "number") setScanned(s.scanned);
    } catch {
      // ignore
    }
  }, []);

  // Persist state on change.
  useEffect(() => {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          jobTitle,
          skillsRaw,
          minRating,
          includeHidden,
          onlyMatched,
          candidates,
          scanned,
        }),
      );
    } catch {
      // ignore
    }
  }, [jobTitle, skillsRaw, minRating, includeHidden, onlyMatched, candidates, scanned]);

  useEffect(() => {
    api.recruiterShortlistList()
      .then((r) => setShortlist(r.items))
      .catch(() => setShortlistError("Failed to load shortlist."));
  }, []);

  useEffect(() => {
    // When the job spec changes, clear previous results (but keep it persisted).
    setCandidates([]);
    setScanned(0);
    setError(null);
  }, [skillsRaw, minRating, includeHidden, onlyMatched, jobTitle]);

  const runMatch = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.recruiterMatch({
        posted_skills: postedSkills,
        min_rating: minRating,
        include_hidden: includeHidden,
        only_matched: onlyMatched,
        limit: 200,
      });
      setCandidates(res.candidates);
      setScanned(res.scanned);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        if (e.status === 401) {
          clearRecruiterToken();
          router.push("/recruiter/login");
        }
      } else {
        setError("Something went wrong.");
      }
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    clearRecruiterToken();
    router.push("/recruiter/login");
  };

  const shortlistIds = useMemo(() => new Set(shortlist.map((s) => s.session_id)), [shortlist]);

  const addToShortlist = async (session_id: string) => {
    try {
      const res = await api.recruiterShortlistAdd(session_id);
      setShortlist((prev) => [res.item, ...prev.filter((p) => p.session_id !== session_id)]);
    } catch (e) {
      if (e instanceof ApiError) setShortlistError(e.message);
      else setShortlistError("Failed to add to shortlist.");
    }
  };

  const removeFromShortlist = async (session_id: string) => {
    try {
      await api.recruiterShortlistRemove(session_id);
      setShortlist((prev) => prev.filter((p) => p.session_id !== session_id));
    } catch (e) {
      if (e instanceof ApiError) setShortlistError(e.message);
      else setShortlistError("Failed to remove from shortlist.");
    }
  };

  return (
    <main className="min-h-screen mc-bg text-[#e0e0e0] mc-font">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
          <div className="mc-font text-4xl mc-text-shadow text-[#f8b700] tracking-widest">
            HIRING PANEL
          </div>
          <button onClick={logout} className="mc-btn-stone px-4 py-2 text-xl tracking-widest">
            LOGOUT
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
          {/* Side panel */}
          <section className="mc-panel p-5 h-fit">
            <div className="mc-font text-[#80ff20] text-xl mc-text-shadow mb-3">JOB POST</div>

            <label className="block mc-font text-[#888888] mb-1">Job title (optional)</label>
            <input
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              className="w-full mc-panel-inset px-3 py-2 text-[#e0e0e0] outline-none"
              placeholder="e.g. Quality Inspector"
            />

            <div className="h-3" />
            <label className="block mc-font text-[#888888] mb-1">Required skills</label>
            <textarea
              value={skillsRaw}
              onChange={(e) => setSkillsRaw(e.target.value)}
              className="w-full mc-panel-inset px-3 py-2 text-[#e0e0e0] outline-none min-h-[140px]"
              placeholder={
                "One per line or comma-separated\nExample:\nQuality control inspection\nSpecification reading\nTeam coordination"
              }
            />

            <div className="mt-2 mc-font text-[#888888] text-sm">
              {postedSkills.length} skills loaded
            </div>

            <div className="h-4" />
            <label className="block mc-font text-[#888888] mb-1">Minimum rating: {minRating}%</label>
            <input
              type="range"
              min={0}
              max={100}
              value={minRating}
              onChange={(e) => setMinRating(Number(e.target.value))}
              className="w-full"
            />

            <div className="mt-3 flex items-center gap-2">
              <input
                id="includeHidden"
                type="checkbox"
                checked={includeHidden}
                onChange={(e) => setIncludeHidden(e.target.checked)}
              />
              <label htmlFor="includeHidden" className="mc-font text-[#888888]">
                Include hidden (inferred) skills
              </label>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <input
                id="onlyMatched"
                type="checkbox"
                checked={onlyMatched}
                onChange={(e) => setOnlyMatched(e.target.checked)}
              />
              <label htmlFor="onlyMatched" className="mc-font text-[#888888]">
                Show only matched candidates
              </label>
            </div>

            <div className="h-5" />

            <button
              onClick={runMatch}
              disabled={loading || postedSkills.length === 0}
              className="mc-btn-green w-full py-3 text-2xl tracking-widest"
            >
              {loading ? "MATCHING..." : "FIND CANDIDATES"}
            </button>

            {error && (
              <div className="mt-4 mc-panel-inset p-3 text-[#c03030] mc-font">
                {error}
              </div>
            )}

            <div className="h-6" />
            <div className="mc-font text-[#80ff20] text-xl mc-text-shadow mb-3">SHORTLIST</div>
            {shortlistError && (
              <div className="mc-panel-inset p-3 text-[#c03030] mc-font mb-3">{shortlistError}</div>
            )}
            {shortlist.length === 0 ? (
              <div className="mc-panel-inset p-3 text-[#888888] mc-font">No shortlisted candidates yet.</div>
            ) : (
              <div className="grid gap-2">
                {shortlist.slice(0, 10).map((s) => (
                  <div key={s.session_id} className="mc-panel-inset p-3 flex items-center justify-between gap-2">
                    <button
                      onClick={() => router.push(`/recruiter/candidate/${encodeURIComponent(s.session_id)}`)}
                      className="mc-font text-[#4fd0e4] text-lg text-left"
                      style={{ background: "none", border: "none", cursor: "pointer" }}
                    >
                      {s.session_id.slice(0, 18)}…
                    </button>
                    <button
                      onClick={() => removeFromShortlist(s.session_id)}
                      className="mc-btn-stone px-2 py-1 text-base tracking-widest"
                    >
                      REMOVE
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Results */}
          <section className="mc-panel p-5">
            <div className="flex items-baseline justify-between gap-4 flex-wrap">
              <div>
                <div className="mc-font text-[#f8b700] text-2xl mc-text-shadow">
                  MATCHES {jobTitle ? `— ${jobTitle}` : ""}
                </div>
                <div className="mc-font text-[#888888] text-sm">
                  Scanned {scanned} profiles · Showing {candidates.length} candidates
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4">
              {candidates.map((c) => (
                <div key={c.session_id} className="mc-panel-inset p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="mc-font text-[#e0e0e0] text-xl">
                        <span className="text-[#4fd0e4]">{c.name || "Candidate"}</span>
                        {c.phone ? <span className="text-[#888888]"> · {c.phone}</span> : null}
                      </div>
                      <div className="mc-font text-[#888888] text-sm mt-1 line-clamp-3">
                        {c.summary || "No summary available."}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="mc-font text-[#80ff20] text-3xl mc-text-shadow">
                        {c.rating}%
                      </div>
                      <div className="mc-font text-[#888888] text-xs">MATCH RATING</div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => router.push(`/recruiter/candidate/${encodeURIComponent(c.session_id)}`)}
                      className="mc-btn-stone px-3 py-2 text-lg tracking-widest"
                    >
                      VIEW PROFILE
                    </button>
                    {shortlistIds.has(c.session_id) ? (
                      <button
                        onClick={() => removeFromShortlist(c.session_id)}
                        className="mc-btn-stone px-3 py-2 text-lg tracking-widest"
                      >
                        REMOVE FROM SHORTLIST
                      </button>
                    ) : (
                      <button
                        onClick={() => addToShortlist(c.session_id)}
                        className="mc-btn-stone px-3 py-2 text-lg tracking-widest"
                      >
                        SHORTLIST
                      </button>
                    )}
                  </div>

                  <div className="mt-3 grid md:grid-cols-2 gap-3">
                    <div>
                      <div className="mc-font text-[#f8b700] text-lg mc-text-shadow mb-1">
                        MATCHED
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {c.matched.length === 0 ? (
                          <span className="mc-font text-[#888888]">None</span>
                        ) : (
                          c.matched.slice(0, 12).map((m, idx) => (
                            <span key={`${m.posted_skill}-${idx}`} className="mc-slot px-2 py-1 text-sm">
                              {m.posted_skill} →{" "}
                              <span className="text-[#80ff20]">{m.candidate_skill}</span>{" "}
                              <span className="text-[#888888]">({m.score})</span>
                            </span>
                          ))
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="mc-font text-[#f8b700] text-lg mc-text-shadow mb-1">
                        MISSING
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {c.missing.length === 0 ? (
                          <span className="mc-font text-[#80ff20]">All required skills matched</span>
                        ) : (
                          c.missing.slice(0, 12).map((s) => (
                            <span key={s} className="mc-slot px-2 py-1 text-sm text-[#c03030]">
                              {s}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {candidates.length === 0 && (
                <div className="mc-panel-inset p-6 text-center text-[#888888] mc-font">
                  Enter required skills, then click “FIND CANDIDATES”.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

