import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { resolveModelRoute } from "../../api-profiles/store";

type ImageGeneratePayload = {
  model?: string;
  prompt?: string;
  size?: string;
  n?: number;
  projectId?: string | number;
};

type ProviderImage = {
  url?: string;
  b64_json?: string;
};

type ProviderResponse = {
  data?: ProviderImage[];
  images?: ProviderImage[];
  error?: { message?: string } | string;
  message?: string;
};

const DEFAULT_BASE_URL = process.env.IMAGE_API_BASE_URL || "https://api.openai.com";
const DEFAULT_MODEL = process.env.IMAGE_MODEL || "gpt-image-1";
const PUBLIC_DIR = path.join(process.cwd(), "public");
const DEFAULT_UPLOAD_ROOT = path.join(PUBLIC_DIR, "uploads");
const IMAGE_EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif"
};

function normalizeBaseUrl(value?: string) {
  return (value || DEFAULT_BASE_URL).trim().replace(/\/$/, "");
}

function appendPath(baseUrl: string, routePath: string) {
  if (baseUrl.endsWith("/v1")) return `${baseUrl}${routePath.replace(/^\/v1/, "")}`;
  return `${baseUrl}${routePath}`;
}

function publicUrlFor(relativePath: string) {
  const baseUrl = process.env.ASSET_PUBLIC_BASE_URL || process.env.PUBLIC_ASSET_BASE_URL || "";
  if (!baseUrl) return relativePath;
  return `${baseUrl.replace(/\/$/, "")}${relativePath}`;
}

function extractError(result: ProviderResponse) {
  if (typeof result.error === "string") return result.error;
  return result.error?.message || result.message || "图片生成失败";
}

async function saveBase64Image(base64: string, projectId: string) {
  return saveImageBuffer(Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ""), "base64"), projectId, ".png");
}

async function saveImageBuffer(buffer: Buffer, projectId: string, extension: string) {
  const uploadRoot = process.env.ASSET_STORAGE_DIR || DEFAULT_UPLOAD_ROOT;
  const targetDir = path.join(uploadRoot, "projects", projectId, "generated-images");
  const filename = `${Date.now()}-${randomUUID()}${extension}`;
  const storagePath = path.join(targetDir, filename);
  const relativePath = `/uploads/projects/${projectId}/generated-images/${filename}`;

  await mkdir(targetDir, { recursive: true });
  await writeFile(storagePath, buffer);

  return {
    storagePath,
    previewUrl: relativePath,
    publicUrl: publicUrlFor(relativePath)
  };
}

async function saveRemoteImage(url: string, projectId: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("下载生成图片失败");
  const contentType = response.headers.get("content-type") || "image/png";
  const extension = IMAGE_EXTENSION_BY_TYPE[contentType.split(";")[0]] || ".png";
  return saveImageBuffer(Buffer.from(await response.arrayBuffer()), projectId, extension);
}

export async function POST(request: Request) {
  const body = await request.json() as ImageGeneratePayload;
  const prompt = body.prompt?.trim();
  const projectId = String(body.projectId || "default").replace(/[^a-zA-Z0-9_-]/g, "-");

  if (!prompt) {
    return NextResponse.json({ code: 400, message: "请先填写生图提示词。" }, { status: 400 });
  }

  const route = await resolveModelRoute("image", body.model);
  if (body.model && !route) {
    return NextResponse.json({ code: 400, message: "当前没有启用的渠道支持所选生图模型，请在模型渠道管理中补充后重试。" }, { status: 400 });
  }
  const profile = route?.profile;

  const apiKey = profile?.apiKey || process.env.IMAGE_API_KEY || process.env.OPENAI_API_KEY || "";
  const baseUrl = normalizeBaseUrl(profile?.baseUrl);
  const model = body.model || route?.model || DEFAULT_MODEL;

  if (!apiKey) {
    return NextResponse.json({ code: 500, message: "缺少图片生成访问凭证，请先在模型渠道中配置图片模型。" }, { status: 500 });
  }

  const response = await fetch(appendPath(baseUrl, "/v1/images/generations"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      prompt,
      size: body.size || "1024x1024",
      n: Math.max(1, Math.min(10, Number(body.n || 1))),
      response_format: "url"
    })
  });

  const text = await response.text();
  let result: ProviderResponse = {};
  try { result = text ? JSON.parse(text) as ProviderResponse : {}; } catch { result = { message: text }; }

  if (!response.ok) {
    return NextResponse.json({ code: response.status, message: extractError(result), raw: result }, { status: response.status });
  }

  const items = result.data || result.images || [];
  const images = await Promise.all(items.map(async (item, index) => {
    if (item.url) {
      const saved = await saveRemoteImage(item.url, projectId);
      return {
        name: `生图结果 ${index + 1}`,
        ...saved
      };
    }
    if (item.b64_json) {
      return {
        name: `生图结果 ${index + 1}`,
        ...(await saveBase64Image(item.b64_json, projectId))
      };
    }
    return null;
  }));

  const readyImages = images.filter(Boolean);
  if (!readyImages.length) {
    return NextResponse.json({ code: 400, message: "图片生成接口没有返回可用图片 URL。" }, { status: 400 });
  }

  return NextResponse.json({ code: 0, data: readyImages });
}
