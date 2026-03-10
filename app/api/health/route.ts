import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "NishAI",
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  );
}
