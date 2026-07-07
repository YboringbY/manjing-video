import { NextResponse } from "next/server";
import { getCurrentMembership } from "@/lib/auth";
import { fetchWithTimeout } from "@/lib/http";

type SeedanceResponse<T> = {
  code: number;
  message?: string;
  trace_id?: string;
  data?: T;
};

type CreateGroupData = {
  id: number | string;
};

const BASE_URL = process.env.SEEDANCE_BASE_URL || "https://aiopenapi.kuaizi.cn";

export async function POST(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });

  const apiKey = process.env.SEEDANCE_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ code: 500, message: "缺少 SEEDANCE_API_KEY，请先在 .env.local 中配置。" }, { status: 500 });
  }

  const body = await request.json() as { group_name?: string; description?: string };

  const response = await fetchWithTimeout(`${BASE_URL}/ai-open-platform-api/v1/asset/group/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ApiKey: apiKey },
    body: JSON.stringify({
      group_name: body.group_name || "漫镜视频素材组",
      description: body.description || "由漫镜视频创建的 Seedance 素材组",
      group_type: 1
    })
  }, 30000);

  const result = await response.json() as SeedanceResponse<CreateGroupData>;

  if (!response.ok || result.code !== 0 || !result.data?.id) {
    return NextResponse.json(
      { code: result.code || response.status, message: result.message || "创建资产组失败", trace_id: result.trace_id },
      { status: response.ok ? 400 : response.status }
    );
  }

  return NextResponse.json({ code: 0, data: { id: result.data.id } });
}
