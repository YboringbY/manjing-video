import { NextResponse } from "next/server";
import { clearAuthSession } from "@/lib/auth";

export async function POST() {
  await clearAuthSession();
  return NextResponse.json({ code: 0 });
}
