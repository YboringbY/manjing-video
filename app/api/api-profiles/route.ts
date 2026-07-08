import { NextResponse } from "next/server";
import { getCurrentMembership, requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { normalizeBaseUrl, readServerApiProfiles, ServerApiProfile, toPublicProfile, validateApiProfileBaseUrl, writeServerApiProfiles } from "./store";

export async function GET() {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });
  const profiles = await readServerApiProfiles();
  const isAdmin = ["super_admin", "tenant_admin"].includes(membership.role);
  return NextResponse.json({
    code: 0,
    data: profiles.map((profile, index) => {
      const publicProfile = toPublicProfile(profile);
      return isAdmin ? publicProfile : { ...publicProfile, name: `模型服务 ${index + 1}`, baseUrl: "" };
    })
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const body = await request.json() as Partial<ServerApiProfile> & { textModels?: string[] | string; scriptModels?: string[] | string; videoModels?: string[] | string; imageModels?: string[] | string; active?: boolean; enabled?: boolean };
  const name = body.name?.trim() || "";
  const baseUrl = normalizeBaseUrl(body.baseUrl || "");
  const apiKey = body.apiKey?.trim() || "";
  const textModels = Array.from(new Set((Array.isArray(body.textModels) ? body.textModels : Array.isArray(body.scriptModels) ? body.scriptModels : String(body.textModels || body.scriptModels || "").split(/\r?\n|,/)).map(item => item.trim()).filter(Boolean)));
  const videoModels = Array.from(new Set((Array.isArray(body.videoModels) ? body.videoModels : String(body.videoModels || body.model || "").split(/\r?\n|,/)).map(item => item.trim()).filter(Boolean)));
  const imageModels = Array.from(new Set((Array.isArray(body.imageModels) ? body.imageModels : String(body.imageModels || "").split(/\r?\n|,/)).map(item => item.trim()).filter(Boolean)));
  const concurrencyLimit = Math.max(1, Math.min(50, Number(body.concurrencyLimit || 1)));

  const profiles = await readServerApiProfiles();
  const existing = profiles.find(profile => profile.id === body.id || (profile.name.trim() === name && normalizeBaseUrl(profile.baseUrl) === baseUrl));
  const priority = Math.max(1, Math.min(999, Number(body.priority || existing?.priority || 100)));
  if (!name || !baseUrl || (!apiKey && !existing?.apiKey) || (!textModels.length && !videoModels.length && !imageModels.length)) return NextResponse.json({ code: 400, message: "请完整填写服务名称、Base URL、API Key，并至少配置一个文字处理、生图或视频模型 ID。编辑已有配置时 API Key 可留空。" }, { status: 400 });
  if (!validateApiProfileBaseUrl(baseUrl)) return NextResponse.json({ code: 400, message: "当前 Base URL 不在允许的模型服务域名范围内。" }, { status: 400 });
  const nextProfile: ServerApiProfile = {
    id: existing?.id || `profile-${Date.now()}`,
    name,
    baseUrl,
    apiKey: apiKey || existing?.apiKey || "",
    model: videoModels[0] || existing?.model || "",
    textModels,
    scriptModels: textModels,
    videoModels,
    imageModels,
    priority,
    enabled: body.enabled ?? existing?.enabled ?? true,
    concurrencyLimit,
    active: body.active ?? existing?.active ?? profiles.length === 0,
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now()
  };
  const next = existing ? profiles.map(profile => profile.id === existing.id ? nextProfile : profile) : [nextProfile, ...profiles];
  await writeServerApiProfiles(next);
  await logAudit({
    request,
    actor: auth.membership,
    action: existing ? "api_profile.update" : "api_profile.create",
    targetType: "api_profile",
    targetId: nextProfile.id,
    metadata: {
      name,
      baseUrl,
      textModelCount: textModels.length,
      imageModelCount: imageModels.length,
      videoModelCount: videoModels.length,
      priority,
      enabled: nextProfile.enabled,
      concurrencyLimit
    }
  });
  return NextResponse.json({ code: 0, data: toPublicProfile(nextProfile), updated: Boolean(existing) });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const body = await request.json() as { id?: string };
  if (!body.id) return NextResponse.json({ code: 400, message: "缺少 Profile ID。" }, { status: 400 });
  const profiles = await readServerApiProfiles();
  const target = profiles.find(profile => profile.id === body.id);
  if (!target) return NextResponse.json({ code: 404, message: "未找到这个 API Profile。" }, { status: 404 });
  const next = profiles.map(profile => ({ ...profile, active: profile.id === body.id }));
  await writeServerApiProfiles(next);
  await logAudit({ request, actor: auth.membership, action: "api_profile.activate", targetType: "api_profile", targetId: body.id, metadata: { name: target.name } });
  return NextResponse.json({ code: 0, data: toPublicProfile({ ...target, active: true }) });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ code: 400, message: "缺少 Profile ID。" }, { status: 400 });
  const profiles = await readServerApiProfiles();
  const target = profiles.find(profile => profile.id === id);
  const next = profiles.filter(profile => profile.id !== id);
  await writeServerApiProfiles(next);
  await logAudit({ request, actor: auth.membership, action: "api_profile.delete", targetType: "api_profile", targetId: id, metadata: { name: target?.name, existed: Boolean(target) } });
  return NextResponse.json({ code: 0 });
}
