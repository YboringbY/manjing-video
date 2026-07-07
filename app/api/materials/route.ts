import { NextResponse } from "next/server";
import { getCurrentMembership } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const KINDS = new Set(["image", "video", "audio", "sd2"]);
const ROLES = new Set(["reference_image", "first_frame", "last_frame", "reference_video", "reference_audio"]);
const SOURCES = new Set(["upload", "generated", "prompt", "link"]);
const STATUSES = new Set(["ready", "processing", "failed"]);
const SCOPES = new Set(["project", "team"]);
const MAX_DATABASE_INT = 2147483647;

function cleanText(value: unknown, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function cleanOptionalText(value: unknown) {
  const text = String(value || "").trim();
  return text || undefined;
}

function cleanNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= MAX_DATABASE_INT ? number : fallback;
}

function publicMaterial(material: {
  id: number;
  projectId: number;
  name: string;
  kind: string;
  role: string;
  url: string;
  previewUrl: string | null;
  storagePath: string | null;
  seedanceAssetUrl: string | null;
  reviewedAssetUrl: string | null;
  source: string;
  status: string;
  scope: string;
  prompt: string | null;
  sourceProjectId: number | null;
  sourceProjectName: string | null;
  createdByName: string | null;
}) {
  return {
    id: material.id,
    dbId: material.id,
    name: material.name,
    kind: material.kind,
    role: material.role,
    url: material.url,
    previewUrl: material.previewUrl || undefined,
    storagePath: material.storagePath || undefined,
    seedanceAssetUrl: material.seedanceAssetUrl || undefined,
    reviewedAssetUrl: material.reviewedAssetUrl || undefined,
    source: material.source,
    status: material.status,
    scope: material.scope,
    prompt: material.prompt || undefined,
    sourceProjectId: material.sourceProjectId || material.projectId,
    sourceProjectName: material.sourceProjectName || undefined,
    createdBy: material.createdByName || undefined
  };
}

export async function GET(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = cleanNumber(searchParams.get("projectId"), 0);
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

  const materials = await prisma.material.findMany({
    where: { tenantId: membership.tenantId, projectId },
    orderBy: { createdAt: "desc" },
    take: 200
  });
  return NextResponse.json({ code: 0, data: materials.map(publicMaterial) });
}

export async function POST(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });

  const body = await request.json();
  const projectId = cleanNumber(body.projectId, 0);
  const name = cleanText(body.name, "未命名素材");
  const kind = cleanText(body.kind, "image");
  const role = cleanText(body.role, "reference_image");
  const url = cleanText(body.url);
  const source = cleanText(body.source, "upload");
  const status = cleanText(body.status, "ready");
  const scope = cleanText(body.scope, "project");

  if (!projectId) return NextResponse.json({ code: 400, message: "缺少项目 ID。" }, { status: 400 });
  if (!url) return NextResponse.json({ code: 400, message: "缺少素材地址。" }, { status: 400 });
  if (!KINDS.has(kind) || !ROLES.has(role) || !SOURCES.has(source) || !STATUSES.has(status) || !SCOPES.has(scope)) {
    return NextResponse.json({ code: 400, message: "素材参数不正确。" }, { status: 400 });
  }

  const material = await prisma.material.create({
    data: {
      tenantId: membership.tenantId,
      projectId,
      name,
      kind,
      role,
      url,
      previewUrl: cleanOptionalText(body.previewUrl),
      storagePath: cleanOptionalText(body.storagePath),
      seedanceAssetUrl: cleanOptionalText(body.seedanceAssetUrl),
      reviewedAssetUrl: cleanOptionalText(body.reviewedAssetUrl),
      source,
      status,
      scope,
      prompt: cleanOptionalText(body.prompt),
      sourceProjectId: cleanNumber(body.sourceProjectId, projectId),
      sourceProjectName: cleanOptionalText(body.sourceProjectName),
      createdById: membership.userId,
      createdByName: membership.user.displayName
    }
  });

  return NextResponse.json({ code: 0, data: publicMaterial(material) });
}

export async function DELETE(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = cleanNumber(searchParams.get("id"), 0);
  if (!id) return NextResponse.json({ code: 400, message: "缺少素材 ID。" }, { status: 400 });

  const material = await prisma.material.findFirst({ where: { id, tenantId: membership.tenantId } });
  if (!material) return NextResponse.json({ code: 404, message: "素材不存在或已被删除。" }, { status: 404 });

  const isAdmin = ["super_admin", "tenant_admin"].includes(membership.role);
  const isOwner = material.createdById === membership.userId;
  const isLegacyProjectMaterial = !material.createdById && material.scope === "project";
  if (!isAdmin && !isOwner && !isLegacyProjectMaterial) {
    return NextResponse.json({ code: 403, message: "只能删除自己上传的素材，团队共享素材请联系管理员处理。" }, { status: 403 });
  }

  await prisma.material.delete({ where: { id: material.id } });
  return NextResponse.json({ code: 0 });
}
