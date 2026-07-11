import { NextResponse } from "next/server";
import { getCurrentMembership } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

function cleanProjectId(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= 2147483647 ? number : 0;
}

function cleanAssetId(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? BigInt(number) : null;
}

export async function DELETE(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const projectId = cleanProjectId(searchParams.get("projectId"));
  const assetId = cleanAssetId(searchParams.get("assetId"));
  if (!projectId || !assetId) return NextResponse.json({ code: 400, message: "缺少项目或视频资产 ID。" }, { status: 400 });
  const result = await prisma.videoAsset.deleteMany({ where: { tenantId: membership.tenantId, projectId, id: assetId } });
  await logAudit({ request, actor: membership, action: "video_asset.delete", targetType: "video_asset", targetId: assetId.toString(), metadata: { projectId, deleted: result.count > 0 } });
  return NextResponse.json({ code: 0, data: { deleted: result.count > 0 } });
}
