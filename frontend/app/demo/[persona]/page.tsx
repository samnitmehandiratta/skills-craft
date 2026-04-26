"use client";
import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import type { DemoProfile } from "@/lib/types";

export default function DemoPage() {
  const router = useRouter();
  const params = useParams();
  const persona = params.persona as string;

  const [profile, setProfile] = useState<DemoProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    api.getDemoProfile(persona)
      .then((p) => {
        setProfile(p);
        sessionStorage.setItem("unmapped_profile", JSON.stringify(p));
        sessionStorage.setItem("unmapped_session", p.session_id);
        sessionStorage.setItem("unmapped_country", p.country.code);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [persona]);

  if (loading) return <LoadingScreen />;
  if (error || !profile) return (
    <div className="min-h-screen bg-white text-gray-900 flex items-center justify-center">
      {error || "Not found"}
    </div>
  );

  const transcript = profile.intake_transcript || [];

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <header className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between">
        <button onClick={() => router.push("/")} className="text-gray-400 hover:text-gray-900 text-sm">← Back</button>
        <span className="text-sm font-semibold text-gray-900">SKILLS-CRAFT · Demo</span>
        <span className="text-gray-400 text-xs">{profile.country.name}</span>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Persona intro */}
        <div className="bg-white rounded-2xl p-6 mb-8 border border-gray-200 shadow-sm">
          <p className="text-gray-400 text-sm mb-1">Meet</p>
          <h1 className="text-3xl font-bold mb-3 text-gray-900">
            {profile.summary.split(" is a")[0]}
          </h1>
          <p className="text-gray-600 leading-relaxed">{profile.summary}</p>
          <div className="mt-4 inline-block bg-yellow-50 text-yellow-700 text-xs px-3 py-1 rounded-full border border-yellow-200">
            {profile.country.name} · {profile.country.region}
          </div>
        </div>

        {/* Replay transcript */}
        {transcript.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm text-gray-400 uppercase tracking-widest mb-4">Intake Conversation</h2>
            <div className="space-y-4">
              {transcript.slice(0, step + 1).map((t, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-start">
                    <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-700 max-w-sm shadow-sm">{t.question}</div>
                  </div>
                  <div className="flex justify-end">
                    <div className="bg-yellow-400 text-gray-900 font-medium rounded-2xl rounded-tr-sm px-4 py-3 text-sm max-w-sm">{t.answer}</div>
                  </div>
                </div>
              ))}
            </div>
            {step < transcript.length - 1 ? (
              <button onClick={() => setStep((s) => s + 1)} className="mt-4 text-sm text-yellow-600 hover:underline font-medium">
                Continue conversation →
              </button>
            ) : (
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => router.push(`/profile/${profile.session_id}`)}
                  className="flex-1 bg-yellow-400 text-gray-900 font-bold py-3 rounded-xl hover:bg-yellow-300 transition"
                >
                  View Skills Profile →
                </button>
                <button
                  onClick={() => router.push("/dashboard")}
                  className="px-4 py-3 border border-gray-200 text-gray-600 rounded-xl hover:border-gray-400 text-sm"
                >
                  Policymaker View
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-400 text-sm">Loading profile...</p>
      </div>
    </div>
  );
}
