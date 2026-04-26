"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ValidatePage() {
  const router = useRouter();
  useEffect(() => { router.replace("/intake"); }, [router]);
  return null;
}
