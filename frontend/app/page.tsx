"use client";
import { useRouter } from "next/navigation";

const DEMO_PERSONAS = [
  { id: "amara_ghana",     name: "Amara",  country: "GH", flag: "🇬🇭", tagline: "Phone repair tech · Accra",     xp: 74 },
  { id: "priya_india",     name: "Priya",  country: "IN", flag: "🇮🇳", tagline: "Garment worker · Tirupur",      xp: 61 },
  { id: "carlos_kenya",    name: "Carlos", country: "KE", flag: "🇰🇪", tagline: "Boda boda op. · Nairobi",       xp: 55 },
  { id: "fatima_bangladesh", name: "Fatima", country: "BD", flag: "🇧🇩", tagline: "Seamstress & trainer · Dhaka", xp: 82 },
  { id: "james_nigeria",   name: "James",  country: "NG", flag: "🇳🇬", tagline: "Market trader · Lagos",         xp: 49 },
];

const FACTS = [
  { icon: "📡", label: "Broken Signals",  desc: "A school cert tells employers almost nothing. Informal skills stay invisible." },
  { icon: "⚡", label: "AI Disruption",   desc: "Automation hits LMIC workers hardest — with zero tools to navigate the shift." },
  { icon: "🔗", label: "No Matching",     desc: "Skills and jobs coexist. The connective tissue to link them is missing." },
];

export default function HomePage() {
  const router = useRouter();

  const loadDemo = (persona: typeof DEMO_PERSONAS[0]) => {
    sessionStorage.setItem("unmapped_country", persona.country);
    router.push(`/demo/${persona.id}`);
  };

  return (
    <main className="min-h-screen mc-bg text-[#e0e0e0] mc-font">


      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-6 py-16 text-center">
        {/* World Bank badge */}
        <div className="inline-block mc-panel px-4 py-1 mb-6 text-[#f8b700] mc-font text-base tracking-widest">
          ★  WORLD BANK YOUTH SUMMIT  ★
        </div>

        <h1 className="mc-font text-5xl md:text-7xl leading-none mb-6 mc-text-shadow text-[#e0e0e0]">
          YOUR CRAFT<br />
          <span className="text-[#80ff20]">IS REAL.</span><br />
          <span className="text-[#f8b700]">WHOLE WORLD IS READY.</span>
        </h1>

        <p className="text-[#888888] text-lg max-w-xl mx-auto mb-3 mc-font">
          Skills-Craft surfaces hidden skills, maps them to global taxonomies, and
          shows where your work is at risk — and where opportunity exists.
        </p>
        <p className="text-[#555555] text-sm mb-10 mc-font">
          Built for 600 million young informal workers in LMICs whose skills are invisible to the formal economy.
        </p>

        {/* Single CTA */}
        <button
          onClick={() => router.push("/intake")}
          className="mc-btn-green px-10 py-4 text-2xl tracking-widest"
        >
          ▶  START YOUR QUEST
        </button>

        {/* XP hint */}
        <p className="mt-4 text-[#888888] mc-font text-base">
          ~8 min · No degree required · 195 countries supported
        </p>
      </section>

      {/* ── Three failures ───────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-6 pb-12 grid md:grid-cols-3 gap-4">
        {FACTS.map((f) => (
          <div key={f.label} className="mc-panel p-5">
            <div className="text-3xl mb-2">{f.icon}</div>
            <div className="mc-font text-[#f8b700] text-lg mb-1 mc-text-shadow">{f.label}</div>
            <p className="text-[#888888] text-sm mc-font leading-snug">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-6 pb-14">
        <h2 className="mc-font text-3xl text-center text-[#e0e0e0] mc-text-shadow mb-6 tracking-wide">
          HOW IT WORKS
        </h2>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { step: "I",  label: "Upload Docs",      desc: "CV, certificate, or transcript. We extract skills automatically." },
            { step: "II", label: "Enter Skills",      desc: "No docs? Just list what you know. One skill per line." },
            { step: "III",label: "Skill Validation",  desc: "AI asks targeted questions per skill to verify your knowledge." },
            { step: "IV", label: "Get Your Map",      desc: "See automation risk, resilience score, and real opportunities." },
          ].map((item) => (
            <div key={item.step} className="mc-panel-inset p-4">
              <div className="mc-font text-[#80ff20] text-base mb-1 mc-text-shadow">[{item.step}]</div>
              <div className="mc-font text-[#e0e0e0] text-lg mb-1">{item.label}</div>
              <p className="text-[#888888] text-xs mc-font leading-snug">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Demo profiles ────────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-6 pb-16">
        <h2 className="mc-font text-3xl text-center text-[#e0e0e0] mc-text-shadow mb-2 tracking-wide">
          DEMO PROFILES
        </h2>
        <p className="text-[#555555] text-sm text-center mc-font mb-6">
          World Bank STEP survey archetypes — real LMIC informal workers.
        </p>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          {DEMO_PERSONAS.map((p) => (
            <button
              key={p.id}
              onClick={() => loadDemo(p)}
              className="mc-panel p-5 text-left hover:brightness-110 transition-all group"
            >
              <div className="text-3xl mb-2">{p.flag}</div>
              <div className="mc-font text-[#f8b700] text-xl mc-text-shadow mb-0.5">{p.name}</div>
              <div className="text-[#888888] text-sm mc-font mb-3">{p.tagline}</div>

              {/* XP bar */}
              <div className="mc-font text-[#80ff20] text-xs mb-1">SKILL XP</div>
              <div className="mc-xp-bar">
                <div className="mc-xp-fill" style={{ width: `${p.xp}%` }} />
              </div>
              <div className="mc-font text-[#888888] text-xs mt-1">{p.xp}/100 XP</div>

              <div className="mt-3 mc-font text-[#888888] text-xs group-hover:text-[#e0e0e0] transition">
                VIEW PROFILE →
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="text-center text-[#333333] text-xs py-6 mc-panel mc-font tracking-wide">
        SKILLS-CRAFT · WORLD BANK YOUTH SUMMIT · DATA: ILO ILOSTAT · WORLD BANK WDI · FREY-OSBORNE · ESCO v1.1
      </footer>
    </main>
  );
}
