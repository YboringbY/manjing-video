import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { boundedInteger, cleanText, databaseInt, positiveVersion, safeBigInt } from "@/lib/api-input";
import { getCurrentMembership } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { safeNumberFromBigInt } from "@/lib/video-task";

function cleanDuration(value: unknown) {
  return boundedInteger(value, 4, 15, 5);
}

function publicShot(shot: { id: bigint; title: string; prompt: string; ratio: string; duration: number; status: string; resolution: string | null; width: number | null; height: number | null; sortOrder: number; version: number; createdAt: Date; updatedAt: Date }) {
  return {
    id: safeNumberFromBigInt(shot.id), title: shot.title, prompt: shot.prompt, ratio: shot.ratio, duration: shot.duration,
    status: shot.status, resolution: shot.resolution || undefined, width: shot.width || undefined, height: shot.height || undefined,
    sortOrder: shot.sortOrder, version: shot.version, createdAt: shot.createdAt.toISOString(), updatedAt: shot.updatedAt.toISOString()
  };
}

async function tenantProject(tenantId: string, projectId: number) {
  return prisma.project.findFirst({ where: { id: projectId, tenantId }, select: { id: true } });
}

export async function GET(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });
  const projectId = databaseInt(new URL(request.url).searchParams.get("projectId"));
  if (!projectId) return NextResponse.json({ code: 400, message: "缺少项目 ID。" }, { status: 400 });
  if (!await tenantProject(membership.tenantId, projectId)) return NextResponse.json({ code: 404, message: "项目不存在。" }, { status: 404 });
  const shots = await prisma.shot.findMany({ where: { tenantId: membership.tenantId, projectId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return NextResponse.json({ code: 0, data: shots.map(publicShot) });
}

export async function POST(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });
  const body = await request.json();
  const projectId = databaseInt(body.projectId);
  const inputs = Array.isArray(body.shots) ? body.shots.slice(0, 200) : body.shot ? [body.shot] : [];
  const replaceShotId = safeBigInt(body.replaceShotId);
  if (!projectId || !inputs.length) return NextResponse.json({ code: 400, message: "缺少项目或分镜数据。" }, { status: 400 });
  if (!await tenantProject(membership.tenantId, projectId)) return NextResponse.json({ code: 404, message: "项目不存在。" }, { status: 404 });

  const saved = await prisma.$transaction(async tx => {
    if (replaceShotId) {
      const running = await tx.videoTask.count({ where: { tenantId: membership.tenantId, projectId, shotId: replaceShotId, status: { in: ["pending", "running"] } } });
      if (running) throw new Error("RUNNING_TASK");
      await tx.videoTask.deleteMany({ where: { tenantId: membership.tenantId, projectId, shotId: replaceShotId } });
      await tx.videoAsset.deleteMany({ where: { tenantId: membership.tenantId, projectId, shotId: replaceShotId } });
      await tx.shot.deleteMany({ where: { tenantId: membership.tenantId, projectId, id: replaceShotId } });
    }
    const currentCount = await tx.shot.count({ where: { tenantId: membership.tenantId, projectId } });
    const rows = [];
    for (let index = 0; index < inputs.length; index += 1) {
      const input = inputs[index] as Record<string, unknown>;
      const id = safeBigInt(input.id);
      if (!id) throw new Error("INVALID_SHOT");
      const row = await tx.shot.upsert({
        where: { tenantId_projectId_id: { tenantId: membership.tenantId, projectId, id } },
        create: {
          tenantId: membership.tenantId, projectId, id, title: cleanText(input.title, "未命名分镜"), prompt: String(input.prompt || ""),
          ratio: cleanText(input.ratio, "9:16 竖屏短剧"), duration: cleanDuration(input.duration), status: "pending",
          resolution: cleanText(input.resolution) || null, width: input.width == null ? null : Number(input.width), height: input.height == null ? null : Number(input.height),
          sortOrder: currentCount + index
        },
        update: {
          title: cleanText(input.title, "未命名分镜"), prompt: String(input.prompt || ""), ratio: cleanText(input.ratio, "9:16 竖屏短剧"),
          duration: cleanDuration(input.duration), resolution: cleanText(input.resolution) || null,
          width: input.width == null ? null : Number(input.width), height: input.height == null ? null : Number(input.height), version: { increment: 1 }
        }
      });
      rows.push(row);
    }
    return rows;
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "RUNNING_TASK") return null;
    throw error;
  });
  if (!saved) return NextResponse.json({ code: 409, message: "分镜仍有生成中的任务，不能拆分替换。" }, { status: 409 });
  await logAudit({ request, actor: membership, action: "shot.save", targetType: "project", targetId: projectId, metadata: { count: saved.length, replacedShotId: replaceShotId?.toString() } });
  return NextResponse.json({ code: 0, data: saved.map(publicShot) });
}

export async function PATCH(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });
  const body = await request.json();
  const projectId = databaseInt(body.projectId);
  const shotId = safeBigInt(body.shotId);
  const version = positiveVersion(body.version);
  if (!projectId || !shotId || !version) return NextResponse.json({ code: 400, message: "缺少分镜版本，请刷新后重试。" }, { status: 400 });
  const data: Prisma.ShotUpdateManyMutationInput = { version: { increment: 1 } };
  if (body.title !== undefined) data.title = cleanText(body.title, "未命名分镜");
  if (body.prompt !== undefined) data.prompt = String(body.prompt);
  if (body.ratio !== undefined) data.ratio = cleanText(body.ratio, "9:16 竖屏短剧");
  if (body.duration !== undefined) data.duration = cleanDuration(body.duration);
  if (body.resolution !== undefined) data.resolution = cleanText(body.resolution) || null;
  if (body.width !== undefined) data.width = body.width == null ? null : Number(body.width);
  if (body.height !== undefined) data.height = body.height == null ? null : Number(body.height);
  const result = await prisma.shot.updateMany({ where: { tenantId: membership.tenantId, projectId, id: shotId, version }, data });
  if (result.count !== 1) {
    const latest = await prisma.shot.findFirst({ where: { tenantId: membership.tenantId, projectId, id: shotId } });
    return NextResponse.json({ code: 409, message: "分镜已被其他窗口更新，请刷新后重试。", data: latest ? publicShot(latest) : undefined }, { status: 409 });
  }
  const shot = await prisma.shot.findFirstOrThrow({ where: { tenantId: membership.tenantId, projectId, id: shotId } });
  return NextResponse.json({ code: 0, data: publicShot(shot) });
}

export async function DELETE(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const projectId = databaseInt(searchParams.get("projectId"));
  const shotId = safeBigInt(searchParams.get("shotId"));
  if (!projectId || !shotId) return NextResponse.json({ code: 400, message: "缺少项目或分镜 ID。" }, { status: 400 });
  const running = await prisma.videoTask.count({ where: { tenantId: membership.tenantId, projectId, shotId, status: { in: ["pending", "running"] } } });
  if (running) return NextResponse.json({ code: 409, message: "分镜仍有生成中的任务，暂时不能删除。" }, { status: 409 });
  const deleted = await prisma.$transaction(async tx => {
    const tasks = await tx.videoTask.deleteMany({ where: { tenantId: membership.tenantId, projectId, shotId } });
    const assets = await tx.videoAsset.deleteMany({ where: { tenantId: membership.tenantId, projectId, shotId } });
    const shots = await tx.shot.deleteMany({ where: { tenantId: membership.tenantId, projectId, id: shotId } });
    return { tasks, assets, shots };
  });
  await logAudit({ request, actor: membership, action: "shot.delete", targetType: "shot", targetId: shotId.toString(), metadata: { projectId, tasks: deleted.tasks.count, assets: deleted.assets.count } });
  return NextResponse.json({ code: 0, data: { deleted: deleted.shots.count > 0 } });
}
