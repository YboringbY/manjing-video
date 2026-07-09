import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export async function POST() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  return NextResponse.json(
    { code: 410, message: "旧余额查询接口已停用。模型渠道费用请以对应上游平台后台为准。" },
    { status: 410 }
  );
}
