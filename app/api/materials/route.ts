import { NextResponse } from "next/server";
import { cleanText, databaseInt, optionalText } from "@/lib/api-input";
import { getCurrentMembership } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { removeStoredMaterialFile, storedMaterialPathForUrl } from "@/lib/material-files";
import { publicMaterial } from "@/lib/material-response";
import { prisma } from "@/lib/prisma";

const KINDS = new Set(["image", "video", "audio", "sd2"]);
const ROLES = new Set(["reference_image", "first_frame", "last_frame", "reference_video", "reference_audio"]);
const SOURCES = new Set(["upload", "generated", "prompt", "link"]);
const STATUSES = new Set(["ready", "processing", "failed"]);
const SCOPES = new Set(["project", "team"]);
function cleanDimension(value: unknown) {
  const number = Number(value);
  if (Number.isInteger(number) && number > 0 && number <= 100000) return number;
  return undefined;
}

export async function GET(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = databaseInt(searchParams.get("projectId"));
  const scope = cleanText(searchParams.get("scope"));

  if (scope === "team") {
    const materials = await prisma.material.findMany({
      where: { tenantId: membership.tenantId, scope: "team" },
      orderBy: { createdAt: "desc" },
      take: 200
    });
    return NextResponse.json({ code: 0, data: materials.map(publicMaterial) });
  }

  if (!projectId) return NextResponse.json({ code: 400, message: "缺少项目 ID。" }, { status: 400 });
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: membership.tenantId }, select: { id: true } });
  if (!project) return NextResponse.json({ code: 404, message: "项目不存在或已被删除。" }, { status: 404 });

  const links = await prisma.projectMaterial.findMany({
    where: { tenantId: membership.tenantId, projectId },
    orderBy: { createdAt: "desc" },
    include: { material: true },
    take: 200
  });
  return NextResponse.json({ code: 0, data: links.map(link => publicMaterial(link.material)) });
}

export async function POST(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });

  const body = await request.json();
  const projectId = databaseInt(body.projectId);
  const name = cleanText(body.name, "未命名素材");
  const kind = cleanText(body.kind, "image");
  const role = cleanText(body.role, "reference_image");
  const url = cleanText(body.url);
  const source = cleanText(body.source, "upload");
  const status = cleanText(body.status, "ready");
  const scope = cleanText(body.scope, "project");
  const previewUrl = optionalText(body.previewUrl);

  if (!projectId) return NextResponse.json({ code: 400, message: "缺少项目 ID。" }, { status: 400 });
  if (!url) return NextResponse.json({ code: 400, message: "缺少素材地址。" }, { status: 400 });
  if (!KINDS.has(kind) || !ROLES.has(role) || !SOURCES.has(source) || !STATUSES.has(status) || !SCOPES.has(scope)) {
    return NextResponse.json({ code: 400, message: "素材参数不正确。" }, { status: 400 });
  }
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: membership.tenantId }, select: { id: true } });
  if (!project) return NextResponse.json({ code: 404, message: "当前项目尚未同步，请刷新后重试。" }, { status: 404 });

  const material = await prisma.$transaction(async tx => {
    const created = await tx.material.create({
      data: {
        tenantId: membership.tenantId,
        projectId,
        name,
        kind,
        role,
        url,
        previewUrl,
        storagePath: storedMaterialPathForUrl(previewUrl || url, projectId),
        seedanceAssetUrl: optionalText(body.seedanceAssetUrl),
        reviewedAssetUrl: optionalText(body.reviewedAssetUrl),
        width: cleanDimension(body.width),
        height: cleanDimension(body.height),
        source,
        status,
        scope,
        prompt: optionalText(body.prompt),
        sourceProjectId: databaseInt(body.sourceProjectId, projectId),
        sourceProjectName: optionalText(body.sourceProjectName),
        createdById: membership.userId,
        createdByName: membership.user.displayName
      }
    });
    await tx.projectMaterial.create({ data: { tenantId: membership.tenantId, projectId, materialId: created.id } });
    return created;
  });

  return NextResponse.json({ code: 0, data: publicMaterial(material) });
}

export async function PATCH(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });

  const body = await request.json();
  const id = databaseInt(body.id);
  const name = cleanText(body.name);
  if (!id) return NextResponse.json({ code: 400, message: "缺少素材 ID。" }, { status: 400 });
  if (!name) return NextResponse.json({ code: 400, message: "请输入素材名称。" }, { status: 400 });
  if (name.length > 120) return NextResponse.json({ code: 400, message: "素材名称最多 120 个字符。" }, { status: 400 });

  const material = await prisma.material.findFirst({ where: { id, tenantId: membership.tenantId } });
  if (!material) return NextResponse.json({ code: 404, message: "素材不存在或已被删除。" }, { status: 404 });

  const isAdmin = ["super_admin", "tenant_admin"].includes(membership.role);
  const isOwner = material.createdById === membership.userId;
  const isLegacyProjectMaterial = !material.createdById && material.scope === "project";
  if (!isAdmin && !isOwner && !isLegacyProjectMaterial) {
    await logAudit({ request, actor: membership, action: "material.rename", targetType: "material", targetId: material.id, result: "blocked", metadata: { oldName: material.name, nextName: name, scope: material.scope, createdById: material.createdById } });
    return NextResponse.json({ code: 403, message: "只能重命名自己上传的素材，团队共享素材请联系管理员处理。" }, { status: 403 });
  }

  const updated = await prisma.material.update({
    where: { id: material.id },
    data: { name }
  });
  await logAudit({ request, actor: membership, action: "material.rename", targetType: "material", targetId: material.id, metadata: { oldName: material.name, nextName: name, kind: material.kind, scope: material.scope, projectId: material.projectId } });
  return NextResponse.json({ code: 0, data: publicMaterial(updated) });
}

export async function DELETE(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = databaseInt(searchParams.get("id"));
  if (!id) return NextResponse.json({ code: 400, message: "缺少素材 ID。" }, { status: 400 });

  const material = await prisma.material.findFirst({ where: { id, tenantId: membership.tenantId } });
  if (!material) {
    await logAudit({ request, actor: membership, action: "material.delete", targetType: "material", targetId: id, metadata: { existed: false } });
    return NextResponse.json({ code: 0, data: { deleted: false } });
  }

  const isAdmin = ["super_admin", "tenant_admin"].includes(membership.role);
  const isOwner = material.createdById === membership.userId;
  const isLegacyProjectMaterial = !material.createdById && material.scope === "project";
  if (!isAdmin && !isOwner && !isLegacyProjectMaterial) {
    await logAudit({ request, actor: membership, action: "material.delete", targetType: "material", targetId: material.id, result: "blocked", metadata: { name: material.name, scope: material.scope, createdById: material.createdById } });
    return NextResponse.json({ code: 403, message: "只能删除自己上传的素材，团队共享素材请联系管理员处理。" }, { status: 403 });
  }

  await prisma.material.delete({ where: { id: material.id } });
  const remainingStorageReferences = material.storagePath
    ? await prisma.material.count({ where: { storagePath: material.storagePath } })
    : 0;
  let fileRemoved = false;
  let fileCleanupFailed = false;
  if (material.storagePath && remainingStorageReferences === 0) {
    try {
      fileRemoved = await removeStoredMaterialFile(material.storagePath);
    } catch {
      fileCleanupFailed = true;
    }
  }
  await logAudit({ request, actor: membership, action: "material.delete", targetType: "material", targetId: material.id, metadata: { name: material.name, kind: material.kind, scope: material.scope, projectId: material.projectId, existed: true, fileRemoved, fileCleanupFailed } });
  return NextResponse.json({ code: 0, data: { deleted: true, fileRemoved, fileCleanupFailed } });
}
