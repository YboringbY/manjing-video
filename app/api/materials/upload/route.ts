import { createHash, randomUUID } from "crypto";
import { createReadStream } from "fs";
import { mkdir, open, readFile, rename, stat, unlink } from "fs/promises";
import path from "path";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { databaseInt } from "@/lib/api-input";
import { logAudit } from "@/lib/audit";
import { getCurrentMembership } from "@/lib/auth";
import { imageDimensionWarning, readImageDimensions } from "@/lib/image-dimensions";
import { publicMaterial } from "@/lib/material-response";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

type MediaKind = "image" | "video" | "audio";
type DetectedMedia = { kind: MediaKind; mimeType: string; extension: string };

const DEFAULT_UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");
const MAX_FILE_SIZE: Record<MediaKind, number> = {
  image: 25 * 1024 * 1024,
  audio: 100 * 1024 * 1024,
  video: 500 * 1024 * 1024
};
const ROLE_BY_KIND: Record<MediaKind, string> = {
  image: "reference_image",
  video: "reference_video",
  audio: "reference_audio"
};

function requestedMediaKind(value: FormDataEntryValue | null, file: File): MediaKind | undefined {
  const requested = String(value || "").trim();
  if (requested === "image" || requested === "video" || requested === "audio") return requested;
  const fromMime = file.type.split("/")[0];
  return fromMime === "image" || fromMime === "video" || fromMime === "audio" ? fromMime : undefined;
}

function detectMedia(header: Buffer, requestedKind?: MediaKind): DetectedMedia | undefined {
  if (header.length >= 8 && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { kind: "image", mimeType: "image/png", extension: ".png" };
  }
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return { kind: "image", mimeType: "image/jpeg", extension: ".jpg" };
  }
  if (header.length >= 12 && header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WEBP") {
    return { kind: "image", mimeType: "image/webp", extension: ".webp" };
  }
  if (header.length >= 6 && ["GIF87a", "GIF89a"].includes(header.toString("ascii", 0, 6))) {
    return { kind: "image", mimeType: "image/gif", extension: ".gif" };
  }
  if (header.length >= 12 && header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WAVE") {
    return { kind: "audio", mimeType: "audio/wav", extension: ".wav" };
  }
  if (header.length >= 3 && header.toString("ascii", 0, 3) === "ID3") {
    return { kind: "audio", mimeType: "audio/mpeg", extension: ".mp3" };
  }
  if (header.length >= 2 && header[0] === 0xff && (header[1] & 0xe0) === 0xe0) {
    return { kind: "audio", mimeType: "audio/mpeg", extension: ".mp3" };
  }
  if (header.length >= 12 && header.toString("ascii", 4, 8) === "ftyp") {
    return requestedKind === "audio"
      ? { kind: "audio", mimeType: "audio/mp4", extension: ".m4a" }
      : { kind: "video", mimeType: "video/mp4", extension: ".mp4" };
  }
  if (header.length >= 4 && header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    return requestedKind === "audio"
      ? { kind: "audio", mimeType: "audio/webm", extension: ".webm" }
      : { kind: "video", mimeType: "video/webm", extension: ".webm" };
  }
  return undefined;
}

function cleanMaterialName(value: FormDataEntryValue | null, file: File) {
  const extension = path.extname(file.name || "");
  const fallback = path.basename(file.name || "未命名素材", extension) || "未命名素材";
  return String(value || fallback).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120) || "未命名素材";
}

function publicUrlFor(relativePath: string) {
  const baseUrl = process.env.ASSET_PUBLIC_BASE_URL || process.env.PUBLIC_ASSET_BASE_URL || "";
  return baseUrl ? `${baseUrl.replace(/\/$/, "")}${relativePath}` : relativePath;
}

async function removeFile(filePath?: string) {
  if (!filePath) return;
  await unlink(filePath).catch(error => {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
  });
}

async function linkedDuplicate(tenantId: string, projectId: number, kind: MediaKind, contentHash: string) {
  return prisma.material.findFirst({
    where: {
      tenantId,
      kind,
      contentHash,
      projectLinks: { some: { tenantId, projectId } }
    },
    orderBy: { createdAt: "asc" }
  });
}

async function fileHash(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function linkedLegacyDuplicate(options: { tenantId: string; projectId: number; kind: MediaKind; contentHash: string; byteSize: number; mimeType: string; uploadRoot: string }) {
  const candidates = await prisma.material.findMany({
    where: {
      tenantId: options.tenantId,
      kind: options.kind,
      contentHash: null,
      storagePath: { not: null },
      projectLinks: { some: { tenantId: options.tenantId, projectId: options.projectId } }
    },
    orderBy: { createdAt: "asc" },
    take: 200
  });

  for (const candidate of candidates) {
    if (!candidate.storagePath) continue;
    const candidatePath = path.resolve(candidate.storagePath);
    if (!candidatePath.startsWith(`${options.uploadRoot}${path.sep}`)) continue;
    try {
      const details = await stat(candidatePath);
      if (!details.isFile() || details.size !== options.byteSize) continue;
      if (await fileHash(candidatePath) !== options.contentHash) continue;
      return await prisma.material.update({
        where: { id: candidate.id },
        data: { contentHash: options.contentHash, byteSize: options.byteSize, mimeType: options.mimeType }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return linkedDuplicate(options.tenantId, options.projectId, options.kind, options.contentHash);
      }
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") continue;
      throw error;
    }
  }
  return null;
}

export async function POST(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });
  const limited = rateLimit(request, { keyPrefix: `materials:upload:${membership.userId}`, limit: 30, windowMs: 10 * 60 * 1000 });
  if (limited) return limited;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ code: 400, message: "上传内容无法解析，请重新选择文件。" }, { status: 400 });
  }

  const files = formData.getAll("file");
  const fileEntry = files[0];
  if (files.length !== 1 || !fileEntry || typeof fileEntry !== "object" || !("arrayBuffer" in fileEntry) || !("slice" in fileEntry) || !("stream" in fileEntry) || !("size" in fileEntry) || !("type" in fileEntry) || !("name" in fileEntry)) {
    return NextResponse.json({ code: 400, message: "每次只能上传一个素材文件。" }, { status: 400 });
  }
  const file = fileEntry as File;

  const projectId = databaseInt(formData.get("projectId"));
  if (!projectId) return NextResponse.json({ code: 400, message: "缺少项目 ID。" }, { status: 400 });
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: membership.tenantId },
    select: { id: true, name: true }
  });
  if (!project) return NextResponse.json({ code: 404, message: "当前项目不存在或已被删除。" }, { status: 404 });

  const requestedKind = requestedMediaKind(formData.get("kind"), file);
  const header = Buffer.from(await file.slice(0, 64).arrayBuffer());
  const detected = detectMedia(header, requestedKind);
  if (!detected || (requestedKind && detected.kind !== requestedKind)) {
    return NextResponse.json({ code: 400, message: "文件内容与素材类型不一致，仅支持有效的图片、视频或音频文件。" }, { status: 400 });
  }
  if (!file.size || file.size > MAX_FILE_SIZE[detected.kind]) {
    const limitMb = Math.round(MAX_FILE_SIZE[detected.kind] / 1024 / 1024);
    return NextResponse.json({ code: 400, message: `${detected.kind === "image" ? "图片" : detected.kind === "video" ? "视频" : "音频"}文件大小需在 ${limitMb}MB 以内。` }, { status: 400 });
  }

  const scope = formData.get("scope") === "team" ? "team" : "project";
  const name = cleanMaterialName(formData.get("name"), file);
  const uploadRoot = path.resolve(process.env.ASSET_STORAGE_DIR || DEFAULT_UPLOAD_ROOT);
  const tempDir = path.join(uploadRoot, ".tmp");
  const targetDir = path.join(uploadRoot, "projects", String(projectId), detected.kind);
  const tempPath = path.join(tempDir, `${randomUUID()}.upload`);
  let finalPath: string | undefined;

  try {
    await mkdir(tempDir, { recursive: true });
    const fileHandle = await open(tempPath, "wx");
    const hash = createHash("sha256");
    let writtenBytes = 0;
    try {
      for await (const chunk of file.stream() as unknown as AsyncIterable<Uint8Array>) {
        const buffer = Buffer.from(chunk);
        hash.update(buffer);
        let offset = 0;
        while (offset < buffer.length) {
          const result = await fileHandle.write(buffer, offset, buffer.length - offset);
          if (!result.bytesWritten) throw new Error("素材文件写入中断。");
          offset += result.bytesWritten;
          writtenBytes += result.bytesWritten;
        }
      }
    } finally {
      await fileHandle.close();
    }
    if (writtenBytes !== file.size) throw new Error("素材文件写入不完整。");
    const contentHash = hash.digest("hex");

    let duplicate = await linkedDuplicate(membership.tenantId, projectId, detected.kind, contentHash);
    if (!duplicate) {
      duplicate = await linkedLegacyDuplicate({
        tenantId: membership.tenantId,
        projectId,
        kind: detected.kind,
        contentHash,
        byteSize: file.size,
        mimeType: detected.mimeType,
        uploadRoot
      });
    }
    if (duplicate) {
      await removeFile(tempPath);
      if (scope === "team" && duplicate.scope !== "team" && (duplicate.createdById === membership.userId || ["super_admin", "tenant_admin"].includes(membership.role))) {
        duplicate = await prisma.material.update({ where: { id: duplicate.id }, data: { scope: "team" } });
      }
      await logAudit({
        request,
        actor: membership,
        action: "material.upload",
        targetType: "material",
        targetId: duplicate.id,
        metadata: { projectId, kind: detected.kind, size: file.size, mimeType: detected.mimeType, deduplicated: true }
      });
      return NextResponse.json({ code: 0, data: publicMaterial(duplicate), deduplicated: true });
    }

    await mkdir(targetDir, { recursive: true });
    const filename = `${Date.now()}-${randomUUID()}${detected.extension}`;
    finalPath = path.join(targetDir, filename);
    await rename(tempPath, finalPath);
    const relativePath = `/uploads/projects/${projectId}/${detected.kind}/${filename}`;
    const dimensions = detected.kind === "image" ? readImageDimensions(await readFile(finalPath), detected.mimeType) : undefined;
    const warning = imageDimensionWarning(dimensions);

    let material;
    try {
      material = await prisma.$transaction(async tx => {
        const created = await tx.material.create({
          data: {
            tenantId: membership.tenantId,
            projectId,
            name,
            kind: detected.kind,
            role: ROLE_BY_KIND[detected.kind],
            url: publicUrlFor(relativePath),
            previewUrl: relativePath,
            storagePath: finalPath,
            width: dimensions?.width,
            height: dimensions?.height,
            contentHash,
            byteSize: file.size,
            mimeType: detected.mimeType,
            source: "upload",
            status: "ready",
            scope,
            sourceProjectId: projectId,
            sourceProjectName: project.name,
            createdById: membership.userId,
            createdByName: membership.user.displayName
          }
        });
        await tx.projectMaterial.create({ data: { tenantId: membership.tenantId, projectId, materialId: created.id } });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        await removeFile(finalPath);
        finalPath = undefined;
        const racedDuplicate = await linkedDuplicate(membership.tenantId, projectId, detected.kind, contentHash);
        if (racedDuplicate) {
          return NextResponse.json({ code: 0, data: publicMaterial(racedDuplicate), deduplicated: true });
        }
      }
      throw error;
    }

    await logAudit({
      request,
      actor: membership,
      action: "material.upload",
      targetType: "material",
      targetId: material.id,
      metadata: { projectId, kind: detected.kind, size: file.size, mimeType: detected.mimeType, width: dimensions?.width, height: dimensions?.height, warning, deduplicated: false }
    });
    return NextResponse.json({ code: 0, data: publicMaterial(material), deduplicated: false, warning });
  } catch (error) {
    await removeFile(tempPath).catch(() => undefined);
    await removeFile(finalPath).catch(() => undefined);
    await logAudit({
      request,
      actor: membership,
      action: "material.upload",
      targetType: "material",
      targetId: String(projectId),
      result: "failure",
      metadata: { projectId, name, kind: detected.kind, size: file.size, message: error instanceof Error ? error.message : "素材上传失败" }
    });
    return NextResponse.json({ code: 500, message: "素材上传或保存失败，请稍后重试。" }, { status: 500 });
  }
}
