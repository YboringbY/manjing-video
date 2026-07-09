import { NextResponse } from "next/server";
import { getCurrentMembership } from "@/lib/auth";

async function disabledLegacyAssetsRoute() {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });

  return NextResponse.json(
    { code: 410, message: "旧外接素材接口已停用。请使用 /api/assets/upload 上传文件，或使用 /api/materials 管理素材记录。" },
    { status: 410 }
  );
}

export async function GET() {
  return disabledLegacyAssetsRoute();
}

export async function POST() {
  return disabledLegacyAssetsRoute();
}
