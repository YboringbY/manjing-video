import { NextResponse } from "next/server";
import { getCurrentMembership, publicUserFromMembership } from "@/lib/auth";

export async function GET() {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "未登录。" }, { status: 401 });
  return NextResponse.json({ code: 0, data: publicUserFromMembership(membership) });
}
