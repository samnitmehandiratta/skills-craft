"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { setRecruiterToken } from "@/lib/recruiterAuth";

export default function RecruiterLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.recruiterLogin(password);
      setRecruiterToken(res.token);
      router.push("/recruiter/hiring");
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen mc-bg text-[#e0e0e0] mc-font flex items-center justify-center px-6">
      <div className="mc-panel p-6 w-full max-w-md">
        <div className="mc-font text-3xl mc-text-shadow text-[#f8b700] tracking-widest mb-4">
          RECRUITER LOGIN
        </div>

        <label className="block mc-font text-[#888888] mb-1">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mc-panel-inset px-3 py-2 text-[#e0e0e0] outline-none"
          placeholder="Enter recruiter password"
        />

        <div className="h-5" />

        <button
          onClick={login}
          disabled={loading || !password.trim()}
          className="mc-btn-green w-full py-3 text-2xl tracking-widest"
        >
          {loading ? "LOGGING IN..." : "LOGIN"}
        </button>

        {error && (
          <div className="mt-4 mc-panel-inset p-3 text-[#c03030] mc-font">
            {error}
          </div>
        )}
      </div>
    </main>
  );
}

