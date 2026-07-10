import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentMembership } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { publicVideoTask, safeNumberFromBigInt } from "@/lib/video-task";

const MAX_DATABASE_INT = 2147483647;

function cleanNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  if (Number.isInteger(number) && number > 0 && number <= MAX_DATABASE_INT) return number;
  if (Number.isFinite(number) && number > MAX_DATABASE_INT) return 1000000000 + (Math.abs(Math.trunc(number)) % 1000000000);
  return fallback;
}

function cleanText(value: unknown, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

type WorkspaceRow = {
  projectId: number;
  name: string;
  state: unknown;
  updatedByName: string | null;
  updatedAt: Date;
};

type ProjectContentRow = Prisma.ProjectGetPayload<{
  include: {
    shots: true;
    videoTasks: true;
    videoAssets: true;
  };
}>;

function publicWorkspace(workspace: {
  projectId: number;
  name: string;
  state: unknown;
  updatedByName: string | null;
  updatedAt: Date;
}) {
  return {
    projectId: workspace.projectId,
    name: workspace.name,
    state: workspace.state,
    updatedBy: workspace.updatedByName || undefined,
    updatedAt: workspace.updatedAt.toISOString()
  };
}

function baseStateObject(state: unknown) {
  return state && typeof state === "object" ? state as Record<string, unknown> : {};
}

function hydrateWorkspace(workspace: WorkspaceRow, project?: ProjectContentRow) {
  if (!project) return publicWorkspace(workspace);
  const baseState = baseStateObject(workspace.state);
  const hydratedState = {
    ...baseState,
    project: {
      ...(baseState.project && typeof baseState.project === "object" ? baseState.project as Record<string, unknown> : {}),
      id: project.id,
      name: project.name,
      type: project.type,
      script: project.script
    },
    shots: project.shots.map(shot => ({
      id: safeNumberFromBigInt(shot.id),
      title: shot.title,
      prompt: shot.prompt,
      ratio: shot.ratio,
      duration: shot.duration,
      status: shot.status,
      resolution: shot.resolution || undefined,
      width: shot.width || undefined,
      height: shot.height || undefined
    })),
    tasks: project.videoTasks.map(publicVideoTask),
    assets: project.videoAssets.map(asset => ({
      id: safeNumberFromBigInt(asset.id),
      shotId: safeNumberFromBigInt(asset.shotId),
      title: asset.title,
      meta: asset.meta,
      gradient: asset.gradient,
      videoUrl: asset.videoUrl || undefined,
      providerTaskId: asset.providerTaskId || undefined
    }))
  };
  return publicWorkspace({ ...workspace, name: project.name, state: hydratedState });
}

function projectFieldsFromState(state: unknown, fallbackName: string) {
  const project = state && typeof state === "object" && "project" in state
    ? (state as { project?: Record<string, unknown> }).project
    : undefined;
  return {
    name: cleanText(project?.name, fallbackName),
    type: cleanText(project?.type, "AI 漫剧"),
    script: String(project?.script || "")
  };
}

function stateArray(state: unknown, key: "shots" | "tasks" | "assets") {
  if (!state || typeof state !== "object") return [];
  const value = (state as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.filter(item => item && typeof item === "object") as Record<string, unknown>[] : [];
}

function cleanBigInt(value: unknown) {
  if (typeof value === "bigint" && value > BigInt(0)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = BigInt(value);
    return parsed > BigInt(0) ? parsed : null;
  }
  return null;
}

function cleanSmallInt(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function nullableText(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

async function syncProjectContent(tx: Prisma.TransactionClient, tenantId: string, projectId: number, state: unknown) {
  const shots = stateArray(state, "shots");
  const assets = stateArray(state, "assets");

  const shotIds = shots.map(shot => cleanBigInt(shot.id)).filter((id): id is bigint => Boolean(id));
  const assetIds = assets.map(asset => cleanBigInt(asset.id)).filter((id): id is bigint => Boolean(id));

  await tx.shot.deleteMany({ where: { tenantId, projectId, ...(shotIds.length ? { id: { notIn: shotIds } } : {}) } });
  await tx.videoAsset.deleteMany({ where: { tenantId, projectId, ...(assetIds.length ? { id: { notIn: assetIds } } : {}) } });

  for (let index = 0; index < shots.length; index += 1) {
    const shot = shots[index];
    const id = cleanBigInt(shot.id);
    if (!id) continue;
    const createData = {
      title: cleanText(shot.title, "未命名分镜"),
      prompt: String(shot.prompt || ""),
      ratio: cleanText(shot.ratio, "9:16 竖屏短剧"),
      duration: cleanSmallInt(shot.duration, 6),
      status: cleanText(shot.status, "pending"),
      resolution: nullableText(shot.resolution),
      width: shot.width == null ? null : cleanSmallInt(shot.width),
      height: shot.height == null ? null : cleanSmallInt(shot.height),
      sortOrder: index
    };
    const { status: _status, ...updateData } = createData;
    await tx.shot.upsert({
      where: { tenantId_projectId_id: { tenantId, projectId, id } },
      create: { tenantId, projectId, id, ...createData },
      update: updateData
    });
  }

  for (const asset of assets) {
    const id = cleanBigInt(asset.id);
    if (!id) continue;
    const data = {
      shotId: cleanBigInt(asset.shotId) || BigInt(0),
      title: cleanText(asset.title, "未命名视频"),
      meta: String(asset.meta || ""),
      gradient: cleanText(asset.gradient, "linear-gradient(135deg, #1f2937, #111827)"),
      videoUrl: nullableText(asset.videoUrl),
      providerTaskId: nullableText(asset.providerTaskId)
    };
    await tx.videoAsset.upsert({
      where: { tenantId_projectId_id: { tenantId, projectId, id } },
      create: { tenantId, projectId, id, ...data },
      update: data
    });
  }
}

export async function GET() {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });

  const [workspaces, projects] = await Promise.all([
    prisma.projectWorkspace.findMany({
      where: { tenantId: membership.tenantId },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.project.findMany({
      where: { tenantId: membership.tenantId },
      include: {
        shots: { orderBy: [{ sortOrder: "asc" }, { updatedAt: "asc" }] },
        videoTasks: { orderBy: { updatedAt: "desc" } },
        videoAssets: { orderBy: { updatedAt: "desc" } }
      }
    })
  ]);
  const projectsById = new Map(projects.map(project => [project.id, project]));

  return NextResponse.json({ code: 0, data: workspaces.map(workspace => hydrateWorkspace(workspace, projectsById.get(workspace.projectId))) });
}

export async function POST(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });

  const body = await request.json();
  const projectId = cleanNumber(body.projectId, 0);
  const state = body.state && typeof body.state === "object"
    ? { ...body.state, project: { ...body.state.project, id: projectId } }
    : body.state;
  const name = cleanText(body.name || state?.project?.name, `项目 ${projectId}`);
  const lastUpdatedAt = cleanText(body.lastUpdatedAt);

  if (!projectId) return NextResponse.json({ code: 400, message: "缺少项目 ID。" }, { status: 400 });
  if (!state || typeof state !== "object") return NextResponse.json({ code: 400, message: "缺少项目工作区数据。" }, { status: 400 });

  const existing = await prisma.projectWorkspace.findUnique({
    where: { tenantId_projectId: { tenantId: membership.tenantId, projectId } }
  });
  const existingProject = await prisma.project.findUnique({ where: { id: projectId } });
  if (existingProject && existingProject.tenantId !== membership.tenantId) {
    return NextResponse.json({ code: 409, message: "项目 ID 已被其他团队使用，请重新创建项目。" }, { status: 409 });
  }
  if (existing && !lastUpdatedAt) {
    return NextResponse.json({
      code: 409,
      message: "项目工作区已存在，但本地缺少版本信息，请先刷新项目后再保存。",
      data: publicWorkspace(existing)
    }, { status: 409 });
  }
  if (existing && existing.updatedAt.toISOString() !== lastUpdatedAt) {
    return NextResponse.json({
      code: 409,
      message: "项目工作区已被其他窗口或成员更新，请先刷新项目后再保存。",
      data: publicWorkspace(existing)
    }, { status: 409 });
  }

  if (!existing) {
    const workspace = await prisma.$transaction(async tx => {
      const projectFields = projectFieldsFromState(state, name);
      await tx.project.upsert({
        where: { id: projectId },
        create: {
          id: projectId,
          tenantId: membership.tenantId,
          ...projectFields,
          createdById: membership.userId,
          updatedById: membership.userId
        },
        update: {
          ...projectFields,
          updatedById: membership.userId
        }
      });
      await syncProjectContent(tx, membership.tenantId, projectId, state);
      return tx.projectWorkspace.create({
        data: {
          tenantId: membership.tenantId,
          projectId,
          name,
          state,
          updatedById: membership.userId,
          updatedByName: membership.user.displayName
        }
      });
    });
    return NextResponse.json({ code: 0, data: publicWorkspace(workspace) });
  }

  const updateResult = await prisma.$transaction(async tx => {
    const updateResult = await tx.projectWorkspace.updateMany({
      where: { id: existing.id, updatedAt: existing.updatedAt },
      data: {
        name,
        state,
        updatedById: membership.userId,
        updatedByName: membership.user.displayName
      }
    });
    if (updateResult.count !== 1) return updateResult;

    const projectFields = projectFieldsFromState(state, name);
    await tx.project.upsert({
      where: { id: projectId },
      create: {
        id: projectId,
        tenantId: membership.tenantId,
        ...projectFields,
        createdById: membership.userId,
        updatedById: membership.userId
      },
      update: {
        ...projectFields,
        updatedById: membership.userId
      }
    });
    await syncProjectContent(tx, membership.tenantId, projectId, state);
    return updateResult;
  });
  if (updateResult.count !== 1) {
    const latest = await prisma.projectWorkspace.findUnique({
      where: { tenantId_projectId: { tenantId: membership.tenantId, projectId } }
    });
    return NextResponse.json({
      code: 409,
      message: "项目工作区刚刚被其他请求更新，请刷新后再保存。",
      data: latest ? publicWorkspace(latest) : undefined
    }, { status: 409 });
  }

  const workspace = await prisma.projectWorkspace.findUniqueOrThrow({
    where: { id: existing.id }
  });

  return NextResponse.json({ code: 0, data: publicWorkspace(workspace) });
}

export async function DELETE(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = cleanNumber(searchParams.get("projectId"), 0);
  if (!projectId) return NextResponse.json({ code: 400, message: "缺少项目 ID。" }, { status: 400 });

  const workspace = await prisma.projectWorkspace.findUnique({
    where: { tenantId_projectId: { tenantId: membership.tenantId, projectId } }
  });
  const deleted = await prisma.$transaction(async tx => {
    const shots = await tx.shot.deleteMany({ where: { tenantId: membership.tenantId, projectId } });
    const videoTasks = await tx.videoTask.deleteMany({ where: { tenantId: membership.tenantId, projectId } });
    const videoAssets = await tx.videoAsset.deleteMany({ where: { tenantId: membership.tenantId, projectId } });
    const materials = await tx.material.deleteMany({ where: { tenantId: membership.tenantId, projectId } });
    const workspaces = await tx.projectWorkspace.deleteMany({ where: { tenantId: membership.tenantId, projectId } });
    const projects = await tx.project.deleteMany({ where: { tenantId: membership.tenantId, id: projectId } });
    return { shots, videoTasks, videoAssets, materials, workspaces, projects };
  });
  await logAudit({
    request,
    actor: membership,
    action: "project.delete",
    targetType: "project",
    targetId: projectId,
    metadata: { name: workspace?.name, deletedWorkspaces: deleted.workspaces.count, deletedMaterials: deleted.materials.count, deletedProjects: deleted.projects.count, deletedShots: deleted.shots.count, deletedVideoTasks: deleted.videoTasks.count, deletedVideoAssets: deleted.videoAssets.count }
  });
  return NextResponse.json({ code: 0 });
}
