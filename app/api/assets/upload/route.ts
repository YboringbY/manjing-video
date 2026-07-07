import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { getCurrentMembership } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const PUBLIC_DIR = path.join(process.cwd(), "public");
const DEFAULT_UPLOAD_ROOT = path.join(PUBLIC_DIR, "uploads");

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/webm": ".webm"
};

function cleanSegment(value: FormDataEntryValue | null, fallback: string) {
  const text = String(value || "").trim();
  return (text || fallback).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) || fallback;
}

function extensionFor(file: File) {
  const fromMime = MIME_EXTENSIONS[file.type];
  if (fromMime) return fromMime;
  const fromName = path.extname(file.name || "").toLowerCase();
  return fromName && fromName.length <= 8 ? fromName : "";
}

function publicUrlFor(relativePath: string) {
  const baseUrl = process.env.ASSET_PUBLIC_BASE_URL || process.env.PUBLIC_ASSET_BASE_URL || "";
  if (!baseUrl) return relativePath;
  return `${baseUrl.replace(/\/$/, "")}${relativePath}`;
}

export async function POST(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });
  const limited = rateLimit(request, { keyPrefix: `assets:upload:${membership.userId}`, limit: 40, windowMs: 10 * 60 * 1000 });
  if (limited) return limited;

  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || typeof file !== "object" || !("arrayBuffer" in file) || !("size" in file) || !("type" in file)) {
    return NextResponse.json({ code: 400, message: "请选择要上传的素材文件。" }, { status: 400 });
  }

  const uploadFile = file as File;

  if (!uploadFile.size || uploadFile.size > MAX_FILE_SIZE) {
    return NextResponse.json({ code: 400, message: "素材文件大小需在 50MB 以内。" }, { status: 400 });
  }

  if (!uploadFile.type.startsWith("image/") && !uploadFile.type.startsWith("video/") && !uploadFile.type.startsWith("audio/")) {
    return NextResponse.json({ code: 400, message: "仅支持图片、视频或音频素材。" }, { status: 400 });
  }

  const projectId = cleanSegment(formData.get("projectId"), "default");
  const kind = cleanSegment(formData.get("kind"), uploadFile.type.split("/")[0] || "asset");
  const uploadRoot = process.env.ASSET_STORAGE_DIR || DEFAULT_UPLOAD_ROOT;
  const targetDir = path.join(uploadRoot, "projects", projectId, kind);
  const filename = `${Date.now()}-${randomUUID()}${extensionFor(uploadFile)}`;
  const storagePath = path.join(targetDir, filename);
  const relativePath = `/uploads/projects/${projectId}/${kind}/${filename}`;

  await mkdir(targetDir, { recursive: true });
  await writeFile(storagePath, Buffer.from(await uploadFile.arrayBuffer()));

  await logAudit({
    request,
    actor: membership,
    action: "asset.upload",
    targetType: "asset",
    targetId: relativePath,
    metadata: {
      projectId,
      kind,
      name: String(formData.get("name") || uploadFile.name || "未命名素材"),
      mimeType: uploadFile.type,
      size: uploadFile.size,
      publicUrlConfigured: Boolean(process.env.ASSET_PUBLIC_BASE_URL || process.env.PUBLIC_ASSET_BASE_URL)
    }
  });

  return NextResponse.json({
    code: 0,
    data: {
      name: String(formData.get("name") || uploadFile.name || "未命名素材"),
      mimeType: uploadFile.type,
      size: uploadFile.size,
      storagePath,
      previewUrl: relativePath,
      publicUrl: publicUrlFor(relativePath)
    }
  });
}
