"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { setToken, setUser } from "@/lib/auth";

// All countries with dial codes + flags
const COUNTRY_CODES = [
  { flag: "🇮🇳", name: "India",               dial: "+91"  },
  { flag: "🇺🇸", name: "United States",        dial: "+1"   },
  { flag: "🇬🇧", name: "United Kingdom",       dial: "+44"  },
  { flag: "🇳🇬", name: "Nigeria",              dial: "+234" },
  { flag: "🇰🇪", name: "Kenya",               dial: "+254" },
  { flag: "🇬🇭", name: "Ghana",               dial: "+233" },
  { flag: "🇧🇩", name: "Bangladesh",          dial: "+880" },
  { flag: "🇵🇭", name: "Philippines",         dial: "+63"  },
  { flag: "🇵🇰", name: "Pakistan",            dial: "+92"  },
  { flag: "🇿🇦", name: "South Africa",        dial: "+27"  },
  { flag: "🇪🇹", name: "Ethiopia",            dial: "+251" },
  { flag: "🇹🇿", name: "Tanzania",            dial: "+255" },
  { flag: "🇺🇬", name: "Uganda",              dial: "+256" },
  { flag: "🇷🇼", name: "Rwanda",              dial: "+250" },
  { flag: "🇿🇲", name: "Zambia",              dial: "+260" },
  { flag: "🇲🇿", name: "Mozambique",          dial: "+258" },
  { flag: "🇸🇳", name: "Senegal",             dial: "+221" },
  { flag: "🇨🇮", name: "Ivory Coast",         dial: "+225" },
  { flag: "🇨🇲", name: "Cameroon",            dial: "+237" },
  { flag: "🇲🇱", name: "Mali",                dial: "+223" },
  { flag: "🇧🇫", name: "Burkina Faso",        dial: "+226" },
  { flag: "🇲🇬", name: "Madagascar",          dial: "+261" },
  { flag: "🇦🇴", name: "Angola",              dial: "+244" },
  { flag: "🇨🇩", name: "DR Congo",            dial: "+243" },
  { flag: "🇸🇩", name: "Sudan",               dial: "+249" },
  { flag: "🇮🇩", name: "Indonesia",           dial: "+62"  },
  { flag: "🇻🇳", name: "Vietnam",             dial: "+84"  },
  { flag: "🇲🇲", name: "Myanmar",             dial: "+95"  },
  { flag: "🇳🇵", name: "Nepal",               dial: "+977" },
  { flag: "🇱🇰", name: "Sri Lanka",           dial: "+94"  },
  { flag: "🇰🇭", name: "Cambodia",            dial: "+855" },
  { flag: "🇲🇾", name: "Malaysia",            dial: "+60"  },
  { flag: "🇹🇭", name: "Thailand",            dial: "+66"  },
  { flag: "🇪🇬", name: "Egypt",               dial: "+20"  },
  { flag: "🇲🇦", name: "Morocco",             dial: "+212" },
  { flag: "🇩🇿", name: "Algeria",             dial: "+213" },
  { flag: "🇹🇳", name: "Tunisia",             dial: "+216" },
  { flag: "🇧🇷", name: "Brazil",              dial: "+55"  },
  { flag: "🇲🇽", name: "Mexico",              dial: "+52"  },
  { flag: "🇨🇴", name: "Colombia",            dial: "+57"  },
  { flag: "🇵🇪", name: "Peru",                dial: "+51"  },
  { flag: "🇦🇷", name: "Argentina",           dial: "+54"  },
  { flag: "🇺🇦", name: "Ukraine",             dial: "+380" },
  { flag: "🇷🇺", name: "Russia",              dial: "+7"   },
  { flag: "🇩🇪", name: "Germany",             dial: "+49"  },
  { flag: "🇫🇷", name: "France",              dial: "+33"  },
  { flag: "🇮🇹", name: "Italy",               dial: "+39"  },
  { flag: "🇪🇸", name: "Spain",               dial: "+34"  },
  { flag: "🇨🇳", name: "China",               dial: "+86"  },
  { flag: "🇯🇵", name: "Japan",               dial: "+81"  },
  { flag: "🇰🇷", name: "South Korea",         dial: "+82"  },
  { flag: "🇦🇺", name: "Australia",           dial: "+61"  },
  { flag: "🇨🇦", name: "Canada",              dial: "+1"   },
  { flag: "🇸🇦", name: "Saudi Arabia",        dial: "+966" },
  { flag: "🇦🇪", name: "UAE",                 dial: "+971" },
  { flag: "🇹🇷", name: "Turkey",              dial: "+90"  },
  { flag: "🇮🇶", name: "Iraq",                dial: "+964" },
  { flag: "🇮🇷", name: "Iran",                dial: "+98"  },
  { flag: "🇦🇫", name: "Afghanistan",         dial: "+93"  },
  { flag: "🇾🇪", name: "Yemen",               dial: "+967" },
  { flag: "🇸🇾", name: "Syria",               dial: "+963" },
  { flag: "🇯🇴", name: "Jordan",              dial: "+962" },
  { flag: "🇱🇧", name: "Lebanon",             dial: "+961" },
  { flag: "🇵🇸", name: "Palestine",           dial: "+970" },
  { flag: "🇲🇼", name: "Malawi",              dial: "+265" },
  { flag: "🇧🇮", name: "Burundi",             dial: "+257" },
  { flag: "🇸🇸", name: "South Sudan",         dial: "+211" },
  { flag: "🇸🇴", name: "Somalia",             dial: "+252" },
  { flag: "🇲🇷", name: "Mauritania",          dial: "+222" },
  { flag: "🇳🇪", name: "Niger",               dial: "+227" },
  { flag: "🇨🇬", name: "Congo",               dial: "+242" },
  { flag: "🇬🇦", name: "Gabon",               dial: "+241" },
  { flag: "🇹🇩", name: "Chad",                dial: "+235" },
  { flag: "🇨🇫", name: "Central African Rep", dial: "+236" },
  { flag: "🇬🇳", name: "Guinea",              dial: "+224" },
  { flag: "🇸🇱", name: "Sierra Leone",        dial: "+232" },
  { flag: "🇱🇷", name: "Liberia",             dial: "+231" },
  { flag: "🇹🇬", name: "Togo",                dial: "+228" },
  { flag: "🇧🇯", name: "Benin",               dial: "+229" },
  { flag: "🇿🇼", name: "Zimbabwe",            dial: "+263" },
  { flag: "🇳🇦", name: "Namibia",             dial: "+264" },
  { flag: "🇧🇼", name: "Botswana",            dial: "+267" },
  { flag: "🇸🇿", name: "Eswatini",            dial: "+268" },
  { flag: "🇱🇸", name: "Lesotho",             dial: "+266" },
  { flag: "🇲🇺", name: "Mauritius",           dial: "+230" },
  { flag: "🇨🇻", name: "Cape Verde",          dial: "+238" },
  { flag: "🇸🇨", name: "Seychelles",          dial: "+248" },
  { flag: "🇨🇴", name: "Comoros",             dial: "+269" },
  { flag: "🇬🇼", name: "Guinea-Bissau",       dial: "+245" },
  { flag: "🇸🇹", name: "São Tomé",            dial: "+239" },
  { flag: "🇲🇻", name: "Maldives",            dial: "+960" },
  { flag: "🇧🇹", name: "Bhutan",              dial: "+975" },
  { flag: "🇱🇦", name: "Laos",                dial: "+856" },
  { flag: "🇲🇳", name: "Mongolia",            dial: "+976" },
  { flag: "🇰🇿", name: "Kazakhstan",          dial: "+7"   },
  { flag: "🇺🇿", name: "Uzbekistan",          dial: "+998" },
  { flag: "🇹🇯", name: "Tajikistan",          dial: "+992" },
  { flag: "🇹🇲", name: "Turkmenistan",        dial: "+993" },
  { flag: "🇰🇬", name: "Kyrgyzstan",          dial: "+996" },
  { flag: "🇦🇲", name: "Armenia",             dial: "+374" },
  { flag: "🇬🇪", name: "Georgia",             dial: "+995" },
  { flag: "🇦🇿", name: "Azerbaijan",          dial: "+994" },
];

type Phase = "phone" | "otp";

function AuthInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const redirectTo   = searchParams.get("redirect") || "/";

  const [phase,     setPhase]     = useState<Phase>("phone");
  const [dialCode,  setDialCode]  = useState("+91");   // default India
  const [localNum,  setLocalNum]  = useState("");
  const [otp,       setOtp]       = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [codeSearch,setCodeSearch]= useState("");
  const [dropOpen,  setDropOpen]  = useState(false);

  // Full E.164 number
  const fullPhone  = `${dialCode}${localNum.replace(/\D/g, "")}`;
  const phoneValid = /^\+\d{7,15}$/.test(fullPhone);

  const selectedCountry = COUNTRY_CODES.find((c) => c.dial === dialCode) || COUNTRY_CODES[0];

  const filteredCodes = COUNTRY_CODES.filter((c) =>
    !codeSearch || c.name.toLowerCase().includes(codeSearch.toLowerCase()) ||
    c.dial.includes(codeSearch)
  );

  const handleSendOtp = async () => {
    if (!phoneValid || loading) return;
    setLoading(true); setError(null);
    try {
      await api.sendOtp(fullPhone);
      setPhase("otp");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to send OTP.");
    } finally { setLoading(false); }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 4 || loading) return;
    setLoading(true); setError(null);
    try {
      const res = await api.verifyOtp(fullPhone, otp.trim());
      setToken(res.token);
      setUser(res.user);
      router.push(res.is_new_user ? "/onboard" : redirectTo);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Incorrect OTP. Please try again.");
    } finally { setLoading(false); }
  };

  return (
    <main className="min-h-screen mc-bg flex items-center justify-center px-4">
      <div className="mc-panel w-full max-w-sm p-8">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="mc-font text-[#f8b700] text-4xl mc-text-shadow tracking-widest mb-1">SKILLS-CRAFT</div>
          <div className="mc-font text-[#e0e0e0] text-2xl mc-text-shadow">
            {phase === "phone" ? "SIGN IN" : "ENTER OTP"}
          </div>
          <p className="text-[#888] text-sm mt-2">
            {phase === "phone"
              ? "We'll send a 4-digit code to your WhatsApp."
              : `Code sent to ${fullPhone}. Expires in 10 minutes.`}
          </p>
        </div>

        {phase === "phone" ? (
          <div className="space-y-4">
            {/* Country code + number row */}
            <div>
              <p className="mc-font text-[#888] text-xs tracking-widest mb-2">WHATSAPP NUMBER</p>
              <div className="flex gap-2">

                {/* Country code picker */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => { setDropOpen(!dropOpen); setCodeSearch(""); }}
                    className="mc-panel-inset mc-font flex items-center gap-1.5 px-3 py-3 text-base text-[#e0e0e0] h-full"
                    style={{ minWidth: 90 }}
                  >
                    <span>{selectedCountry.flag}</span>
                    <span style={{ color: "#f8b700" }}>{dialCode}</span>
                    <span className="text-[#555]">▼</span>
                  </button>

                  {dropOpen && (
                    <div
                      className="absolute left-0 top-full mt-1 z-50 mc-panel"
                      style={{ width: 240, maxHeight: 280, overflowY: "auto" }}
                    >
                      {/* Search */}
                      <div className="p-2 border-b border-[#2a2a2a]">
                        <input
                          autoFocus
                          value={codeSearch}
                          onChange={(e) => setCodeSearch(e.target.value)}
                          placeholder="Search country..."
                          className="w-full mc-font text-sm text-[#e0e0e0] placeholder-[#555] px-2 py-1 outline-none"
                          style={{ background: "#1a1a1a", border: "2px solid #1b1b1b" }}
                        />
                      </div>
                      {filteredCodes.map((c) => (
                        <button
                          key={c.name + c.dial}
                          type="button"
                          onClick={() => { setDialCode(c.dial); setDropOpen(false); }}
                          className="w-full flex items-center gap-2 px-3 py-2 mc-font text-sm text-[#e0e0e0] hover:brightness-125 text-left"
                          style={{ background: c.dial === dialCode ? "#2a2a2a" : "transparent" }}
                        >
                          <span className="shrink-0">{c.flag}</span>
                          <span className="flex-1 truncate">{c.name}</span>
                          <span className="shrink-0" style={{ color: "#f8b700" }}>{c.dial}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Local number */}
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="9876543210"
                  value={localNum}
                  onChange={(e) => setLocalNum(e.target.value.replace(/[^\d\s\-]/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                  className="flex-1 mc-font text-base text-[#e0e0e0] placeholder-[#555] px-3 py-3 outline-none mc-panel-inset"
                  autoFocus
                />
              </div>
              <p className="text-[#555] text-xs mt-1.5 mc-font">
                Full number: <span style={{ color: "#888" }}>{fullPhone || "—"}</span>
              </p>
            </div>

            {error && (
              <div className="mc-panel px-4 py-3" style={{ borderColor: "#7a0000" }}>
                <p className="mc-font text-[#ff6060] text-sm">{error}</p>
              </div>
            )}

            <button
              onClick={handleSendOtp}
              disabled={!phoneValid || loading}
              className="mc-btn-green w-full py-3 text-xl"
            >
              {loading ? "SENDING..." : "SEND WHATSAPP OTP →"}
            </button>
            <button
              onClick={() => router.push("/")}
              className="mc-btn-stone w-full py-2 text-base"
            >
              ← BACK TO HOME
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="mc-font text-[#888] text-xs tracking-widest mb-2">4-DIGIT OTP</p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                placeholder="····"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && handleVerifyOtp()}
                className="w-full mc-font text-3xl text-center tracking-[0.6em] text-[#f8b700] placeholder-[#555] px-4 py-4 outline-none mc-panel-inset mc-text-shadow"
                autoFocus
              />
            </div>

            {error && (
              <div className="mc-panel px-4 py-3" style={{ borderColor: "#7a0000" }}>
                <p className="mc-font text-[#ff6060] text-sm">{error}</p>
              </div>
            )}

            <button
              onClick={handleVerifyOtp}
              disabled={otp.length !== 4 || loading}
              className="mc-btn-green w-full py-3 text-xl"
            >
              {loading ? "VERIFYING..." : "VERIFY OTP →"}
            </button>
            <button
              onClick={() => { setPhase("phone"); setOtp(""); setError(null); }}
              className="mc-btn-stone w-full py-2 text-base"
            >
              ← CHANGE NUMBER
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

export default function AuthPage() {
  return (
    <Suspense>
      <AuthInner />
    </Suspense>
  );
}
