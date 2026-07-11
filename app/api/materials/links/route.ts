import { NextResponse } from "next/server";
import { getCurrentMembership } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const MAX_DATABASE_INT = 2147483647;

function cleanId(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= MAX_DATABASE_INT ? number : 0;
}

export async function POST(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });
  const body = await request.json();
  const projectId = cleanId(body.projectId);
  const materialId = cleanId(body.materialId);
  if (!projectId || !materialId) return NextResponse.json({ code: 400, message: "缺少有效的项目或素材 ID。" }, { status: 400 });

  const [project, material] = await Promise.all([
    prisma.project.findFirst({ where: { id: projectId, tenantId: membership.tenantId }, select: { id: true } }),
    prisma.material.findFirst({ where: { id: materialId, tenantId: membership.tenantId } })
  ]);
  if (!project || !material) return NextResponse.json({ code: 404, message: "项目或素材不存在。" }, { status: 404 });
  if (material.scope !== "team" && material.projectId !== projectId) {
    return NextResponse.json({ code: 403, message: "项目独享素材不能关联到其他项目。" }, { status: 403 });
  }

  await prisma.projectMaterial.upsert({
    where: { tenantId_projectId_materialId: { tenantId: membership.tenantId, projectId, materialId } },
    create: { tenantId: membership.tenantId, projectId, materialId },
    update: {}
  });
  await logAudit({ request, actor: membership, action: "material.link", targetType: "material", targetId: materialId, metadata: { projectId, scope: material.scope } });
  return NextResponse.json({ code: 0, data: { linked: true } });
}

export async function DELETE(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const projectId = cleanId(searchParams.get("projectId"));
  const materialId = cleanId(searchParams.get("materialId"));
  if (!projectId || !materialId) return NextResponse.json({ code: 400, message: "缺少有效的项目或素材 ID。" }, { status: 400 });

  const material = await prisma.material.findFirst({ where: { id: materialId, tenantId: membership.tenantId } });
  if (!material) return NextResponse.json({ code: 0, data: { unlinked: false } });
  if (material.scope !== "team" || material.projectId === projectId) {
    return NextResponse.json({ code: 400, message: "源项目素材不能只解除关联，请使用删除素材。" }, { status: 400 });
  }

  const result = await prisma.projectMaterial.deleteMany({ where: { tenantId: membership.tenantId, projectId, materialId } });
  await logAudit({ request, actor: membership, action: "material.unlink", targetType: "material", targetId: materialId, metadata: { projectId, removed: result.count } });
  return NextResponse.json({ code: 0, data: { unlinked: result.count > 0 } });
}
