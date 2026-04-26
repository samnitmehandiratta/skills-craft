import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : req.headers.get("x-real-ip") || "";

  // Private / loopback IPs have no geo data
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.") || ip.startsWith("172.")) {
    return NextResponse.json({ country_code: null });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode,status`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await res.json();
    if (data.status === "success" && data.countryCode) {
      return NextResponse.json({ country_code: data.countryCode });
    }
  } catch {
    // fall through
  }

  return NextResponse.json({ country_code: null });
}
