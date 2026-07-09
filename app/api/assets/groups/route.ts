import { NextResponse } from "next/server";
import { getCurrentMembership } from "@/lib/auth";

export async function POST() {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });

  return NextResponse.json(
    { code: 410, message: "旧外接素材组接口已停用。当前素材直接通过项目素材库和团队共享管理。" },
    { status: 410 }
  );
}
