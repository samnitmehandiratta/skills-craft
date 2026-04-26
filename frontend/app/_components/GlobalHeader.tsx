"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { isLoggedIn, clearToken, clearUser } from "@/lib/auth";

const HIDDEN_PREFIXES = [
  "/auth",
  "/onboard",
  "/validate/interview",
  "/profile/",
  "/risk/",
  "/opportunities/",
];

export default function GlobalHeader() {
  const router   = useRouter();
  const pathname = usePathname();
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(isLoggedIn());
  }, [pathname]);

  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  const handleSignOut = () => {
    clearToken();
    clearUser();
    setLoggedIn(false);
    router.push("/");
  };

  return (
    <nav
      className="mc-panel sticky top-0 z-50 border-x-0 border-t-0"
      style={{ padding: "8px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}
    >
      {/* Logo */}
      <button
        onClick={() => router.push("/")}
        className="mc-font mc-text-shadow tracking-widest"
        style={{ color: "#f8b700", fontSize: "1.5rem", background: "none", border: "none", cursor: "pointer" }}
      >
        SKILLS-CRAFT
      </button>

      {/* Right side: all buttons in one row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={() => router.push("/dashboard")}
          className="mc-btn-stone"
          style={{ padding: "4px 14px", fontSize: "1rem" }}
        >
          POLICY VIEW
        </button>

        {loggedIn ? (
          <>
            <button
              onClick={() => router.push("/account")}
              className="mc-btn-stone"
              style={{ padding: "4px 14px", fontSize: "1rem" }}
            >
              MY ACCOUNT
            </button>
            <button
              onClick={handleSignOut}
              className="mc-font"
              style={{
                padding: "4px 14px",
                fontSize: "1rem",
                background: "#7a0000",
                border: "3px solid #1b1b1b",
                boxShadow: "inset -3px -3px 0 #4a0000, inset 3px 3px 0 #c03030",
                color: "#fff",
                textShadow: "1px 1px 0 #000",
                cursor: "pointer",
              }}
            >
              SIGN OUT
            </button>
          </>
        ) : (
          <button
            onClick={() => router.push(`/auth?redirect=${encodeURIComponent(pathname)}`)}
            className="mc-font"
            style={{
              padding: "4px 14px",
              fontSize: "1rem",
              background: "#f8b700",
              border: "3px solid #1b1b1b",
              boxShadow: "inset -3px -3px 0 #b08000, inset 3px 3px 0 #ffe066",
              color: "#1a1a1a",
              textShadow: "1px 1px 0 rgba(0,0,0,0.15)",
              cursor: "pointer",
            }}
          >
            LOGIN
          </button>
        )}
      </div>
    </nav>
  );
}
