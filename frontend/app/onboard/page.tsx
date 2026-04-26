"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { getToken, getUser, setUser } from "@/lib/auth";
import { ALL_COUNTRIES, findCountry } from "@/lib/countries";
import type { CountryOption } from "@/lib/countries";

const GENDER_OPTIONS = ["Male", "Female", "Other"] as const;

export default function OnboardPage() {
  const router = useRouter();
  const [name,          setName]          = useState("");
  const [dob,           setDob]           = useState("");
  const [gender,        setGender]        = useState("");
  const [countryCode,   setCountryCode]   = useState("");
  const [countrySearch, setCountrySearch] = useState("");
  const [showDropdown,  setShowDropdown]  = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!getToken()) { router.push("/auth"); return; }
    const u = getUser();
    if (u) {
      if (u.name)         setName(u.name);
      if (u.dob)          setDob(u.dob);
      if (u.gender)       setGender(u.gender);
      if (u.country_code) {
        setCountryCode(u.country_code);
        const c = findCountry(u.country_code);
        if (c) setCountrySearch(c.name);
      }
    }
  }, [router]);

  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() - 13);
  const maxDateStr = maxDate.toISOString().split("T")[0];

  const filteredCountries: CountryOption[] = countrySearch.length === 0
    ? ALL_COUNTRIES
    : ALL_COUNTRIES.filter((c) =>
        c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
        c.code.toLowerCase().includes(countrySearch.toLowerCase())
      );

  const handleSelectCountry = (c: CountryOption) => {
    setCountryCode(c.code);
    setCountrySearch(c.name);
    setShowDropdown(false);
    inputRef.current?.blur();
  };

  const selectedCountry = countryCode ? findCountry(countryCode) : null;

  const handleSubmit = async () => {
    if (!name.trim() || !dob || !gender || !countryCode || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.updateMe({ name: name.trim(), dob, gender, country_code: countryCode });
      setUser(res.user);
      router.push("/intake");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="font-bold text-xl tracking-tight text-gray-900">SKILLS-CRAFT</span>
          <h1 className="text-2xl font-bold text-gray-900 mt-4 mb-2">Tell us about you</h1>
          <p className="text-gray-500 text-sm">
            Helps personalise your skill map and opportunity matches.
          </p>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Amara Mensah"
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-yellow-400/50 placeholder-gray-400"
              autoFocus
            />
          </div>

          {/* DOB */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date of birth</label>
            <input
              type="date"
              value={dob}
              max={maxDateStr}
              onChange={(e) => setDob(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-yellow-400/50"
            />
          </div>

          {/* Gender */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
            <div className="grid grid-cols-3 gap-2">
              {GENDER_OPTIONS.map((g) => (
                <button
                  key={g}
                  onClick={() => setGender(g)}
                  className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    gender === g
                      ? "border-yellow-500 bg-yellow-50 text-yellow-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-400 bg-white"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Country */}
          <div className="relative" ref={dropdownRef}>
            <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
            <div className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm flex items-center gap-2 focus-within:ring-2 focus-within:ring-yellow-400/50">
              {selectedCountry && (
                <span className="text-base flex-shrink-0">{selectedCountry.flag}</span>
              )}
              <input
                ref={inputRef}
                type="text"
                value={countrySearch}
                onChange={(e) => {
                  setCountrySearch(e.target.value);
                  setCountryCode("");
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setShowDropdown(false)}
                placeholder="Search country…"
                className="flex-1 outline-none bg-transparent placeholder-gray-400 text-sm text-gray-900"
              />
            </div>
            {showDropdown && (
              <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                {filteredCountries.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-gray-400">No countries found</li>
                ) : (
                  filteredCountries.map((c) => (
                    <li key={c.code}>
                      <button
                        type="button"
                        onPointerDown={(e) => { e.preventDefault(); handleSelectCountry(c); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-gray-50 transition ${
                          c.code === countryCode ? "bg-yellow-50 text-yellow-700" : "text-gray-700"
                        }`}
                      >
                        <span className="text-base">{c.flag}</span>
                        <span>{c.name}</span>
                        <span className="ml-auto text-xs text-gray-400">{c.code}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>

          {error && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={!name.trim() || !dob || !gender || !countryCode || loading}
            className="w-full bg-yellow-400 text-gray-900 font-bold py-3 rounded-xl hover:bg-yellow-300 transition disabled:opacity-40"
          >
            {loading ? "Saving…" : "Continue →"}
          </button>
        </div>
      </div>
    </main>
  );
}
