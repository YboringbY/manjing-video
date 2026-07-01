import { NextResponse } from "next/server";
import { normalizeBaseUrl, readServerApiProfiles, ServerApiProfile, toPublicProfile, writeServerApiProfiles } from "./store";

export async function GET() {
  const profiles = await readServerApiProfiles();
  return NextResponse.json({ code: 0, data: profiles.map(toPublicProfile) });
}

export async function POST(request: Request) {
  const body = await request.json() as Partial<ServerApiProfile>;
  const name = body.name?.trim() || "";
  const baseUrl = normalizeBaseUrl(body.baseUrl || "");
  const apiKey = body.apiKey?.trim() || "";
  const model = body.model?.trim() || "";
  if (!name || !baseUrl || !apiKey || !model) return NextResponse.json({ code: 400, message: "请完整填写平台名称、Base URL、API Key 和模型名。" }, { status: 400 });

  const profiles = await readServerApiProfiles();
  const existing = profiles.find(profile => profile.id === body.id || (profile.name.trim() === name && normalizeBaseUrl(profile.baseUrl) === baseUrl && profile.model.trim() === model));
  const nextProfile: ServerApiProfile = {
    id: existing?.id || `profile-${Date.now()}`,
    name,
    baseUrl,
    apiKey,
    model,
    active: existing?.active || false,
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now()
  };
  const next = existing ? profiles.map(profile => profile.id === existing.id ? nextProfile : profile) : [nextProfile, ...profiles];
  await writeServerApiProfiles(next);
  return NextResponse.json({ code: 0, data: toPublicProfile(nextProfile), updated: Boolean(existing) });
}

export async function PATCH(request: Request) {
  const body = await request.json() as { id?: string };
  if (!body.id) return NextResponse.json({ code: 400, message: "缺少 Profile ID。" }, { status: 400 });
  const profiles = await readServerApiProfiles();
  const target = profiles.find(profile => profile.id === body.id);
  if (!target) return NextResponse.json({ code: 404, message: "未找到这个 API Profile。" }, { status: 404 });
  const next = profiles.map(profile => ({ ...profile, active: profile.id === body.id }));
  await writeServerApiProfiles(next);
  return NextResponse.json({ code: 0, data: toPublicProfile({ ...target, active: true }) });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ code: 400, message: "缺少 Profile ID。" }, { status: 400 });
  if (id === "fastgate-default") return NextResponse.json({ code: 400, message: "默认 AIfastgate Profile 不能删除。" }, { status: 400 });
  const profiles = await readServerApiProfiles();
  const next = profiles.filter(profile => profile.id !== id);
  await writeServerApiProfiles(next);
  return NextResponse.json({ code: 0 });
}
