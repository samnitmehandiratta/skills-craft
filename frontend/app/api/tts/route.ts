import { NextRequest, NextResponse } from "next/server";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

export async function POST(req: NextRequest) {
  const { text } = await req.json();
  if (!text) return NextResponse.json({ error: "no_text" }, { status: 400 });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${BASE}/api/v1/validation/interview/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const audio = await res.arrayBuffer();
      return new NextResponse(audio, {
        headers: { "Content-Type": "audio/mpeg" },
      });
    }
  } catch {
    // fall through to 503
  }

  return NextResponse.json({ error: "tts_unavailable" }, { status: 503 });
}
