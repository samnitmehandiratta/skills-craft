"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RecruiterIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/recruiter/login");
  }, [router]);

  return (
    <main className="min-h-screen mc-bg text-[#e0e0e0] mc-font flex items-center justify-center px-6">
      <div className="mc-panel p-6 w-full max-w-md text-center">
        Redirecting to recruiter login…
      </div>
    </main>
  );
}
