"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { getToken, getUser, setUser, clearToken, clearUser } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import type { AuthUser, SavedProfile, SkillProfile } from "@/lib/types";

export default function AccountPage() {
  const router = useRouter();
  const [user,     setUserState] = useState<AuthUser | null>(null);
  const [profiles, setProfiles]  = useState<SavedProfile[]>([]);
  const [loading,  setLoading]   = useState(true);

  useEffect(() => {
    if (!getToken()) { router.push("/auth?redirect=/account"); return; }
    const cached = getUser();
    if (cached) setUserState(cached);

    api.getMe()
      .then((res) => {
        setUserState(res.user);
        setProfiles(res.profiles);
        setUser(res.user);   // keep localStorage in sync with DB
      })
      .catch((err: unknown) => {
        // Only clear auth on 401 (invalid/expired token). Transient errors
        // (network, 500) should not log the user out.
        if (err instanceof ApiError && err.status === 401) {
          clearToken(); clearUser(); router.push("/auth");
        }
        // Otherwise stay on the page — cached data is still visible
      })
      .finally(() => setLoading(false));
  }, [router]);

  const openProfile = (p: SavedProfile) => {
    sessionStorage.setItem("unmapped_profile", p.profile_json);
    if (p.validation_json) {
      try { sessionStorage.setItem("unmapped_validation_result", p.validation_json); } catch { /* ignore */ }
    }
    router.push(`/profile/${p.session_id}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen mc-bg flex items-center justify-center">
        <div className="mc-panel p-8 text-center">
          <div className="flex items-end gap-1.5 h-8 justify-center mb-3">
            {[4, 8, 12, 6, 10, 4, 8].map((h, i) => (
              <div key={i} className="animate-bounce" style={{ width: 5, height: h, background: "#f8b700", animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
          <p className="mc-font text-[#bbb] text-lg">LOADING...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen mc-bg mc-font text-[#e0e0e0]">
      <div className="max-w-2xl mx-auto px-5 py-8 space-y-5">

        {/* Player card */}
        <div className="mc-panel p-5">
          <p className="text-[#bbb] text-xs tracking-widest mb-3">PLAYER PROFILE</p>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="text-[#f8b700] text-2xl mc-text-shadow">
                {user?.name || "UNNAMED PLAYER"}
              </div>
              <div className="text-[#bbb] text-sm">{user?.phone}</div>
              {user?.dob && (
                <div className="text-[#bbb] text-xs">
                  Born {new Date(user.dob).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                  {user.gender ? ` · ${user.gender}` : ""}
                </div>
              )}
            </div>
            <button
              onClick={() => router.push("/onboard")}
              className="mc-btn-stone px-4 py-1.5 text-base shrink-0"
            >
              EDIT
            </button>
          </div>
        </div>

        {/* Skill profiles section */}
        <div className="flex items-center justify-between">
          <span className="text-[#e0e0e0] text-lg tracking-widest">
            MY SKILL PROFILES <span className="text-[#bbb]">({profiles.length})</span>
          </span>
          <button onClick={() => router.push("/intake")} className="mc-btn-green px-4 py-1.5 text-base">
            + NEW PROFILE
          </button>
        </div>

        {profiles.length === 0 ? (
          <div className="mc-panel-inset p-12 text-center">
            <div className="text-5xl mb-4">🗺</div>
            <p className="text-[#bbb] text-lg mb-1">NO SAVED PROFILES</p>
            <p className="text-[#bbb] text-sm mb-8">Complete an interview to map your skills.</p>
            <button onClick={() => router.push("/intake")} className="mc-btn-green px-8 py-3 text-xl">
              ▶ START YOUR QUEST
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {profiles.map((p) => {
              let pd: SkillProfile | null = null;
              try { pd = JSON.parse(p.profile_json) as SkillProfile; } catch { /* ignore */ }
              const total   = pd?.skill_counts?.total ?? "?";
              const hidden  = pd?.skill_counts?.hidden ?? 0;
              const country = pd?.country?.name ?? pd?.country?.code ?? "Unknown";
              const date    = new Date(p.created_at).toLocaleDateString("en-US", {
                year: "numeric", month: "short", day: "numeric",
              });
              return (
                <button
                  key={p.id}
                  onClick={() => openProfile(p)}
                  className="w-full mc-panel p-4 text-left transition-all hover:brightness-110"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-[#f8b700] text-base mc-text-shadow">{country}</div>
                      <div className="text-[#bbb] text-sm">
                        {total} skills · {hidden} hidden · {date}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 mt-0.5">
                      {p.validation_json && (
                        <span
                          className="mc-font text-xs px-2 py-0.5 mc-panel-inset mc-text-shadow"
                          style={{ color: "#80ff20" }}
                        >
                          ✔ VALIDATED
                        </span>
                      )}
                      <span className="text-[#bbb] text-lg">→</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

      </div>
    </main>
  );
}
