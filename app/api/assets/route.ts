import { NextResponse } from "next/server";
import { getCurrentMembership } from "@/lib/auth";
import { fetchWithTimeout } from "@/lib/http";

type SeedanceResponse<T> = {
  code: number;
  message?: string;
  trace_id?: string;
  data?: T;
};

type CreateAssetData = {
  id: number | string;
};

type AssetItem = {
  id: number | string;
  group_id: number | string;
  asset_name: string;
  asset_type: number;
  url: string;
  asset_status: number;
  sync_status: number;
  sync_error?: string;
  created_at: string;
  updated_at: string;
};

type ListAssetsData = {
  list: AssetItem[];
  total: number | string;
  page: number;
  page_size: number;
};

const BASE_URL = process.env.SEEDANCE_BASE_URL || "https://aiopenapi.kuaizi.cn";
const DEFAULT_GROUP_ID = "181862014778343444";
const DEFAULT_GROUP_NAME = "user_216";

function getApiKey() {
  return process.env.SEEDANCE_API_KEY;
}

function assetTypeLabel(value: number) {
  return ({ 1: "图片", 2: "视频", 3: "音频", 4: "提示词", 5: "提示词" } as Record<number, string>)[value] || String(value);
}

function syncStatusLabel(value: number) {
  return ({ 0: "待同步", 1: "同步中", 2: "已同步", 3: "同步失败", 4: "处理中" } as Record<number, string>)[value] || String(value);
}

function assetStatusLabel(value: number) {
  return ({ 1: "待审核", 2: "审核中", 3: "已过审", 4: "禁用" } as Record<number, string>)[value] || String(value);
}

function formatDateTime(value: string) {
  return value.replace("T", " ").replace(/\+.*$/, "");
}

function toVisualAsset(item: AssetItem, groupName = DEFAULT_GROUP_NAME) {
  return {
    id: String(item.id),
    asset_url: `asset://${item.id}`,
    asset_name: item.asset_name,
    类型: assetTypeLabel(item.asset_type),
    同步状态: syncStatusLabel(item.sync_status),
    失败原因: item.sync_error || "—",
    资产状态: assetStatusLabel(item.asset_status),
    所属组: groupName,
    group_id: String(item.group_id),
    创建时间: formatDateTime(item.created_at),
    操作: ["详情", "编辑", "删除"],
    原始URL: item.url,
    raw: item
  };
}

export async function GET(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });

  const apiKey = getApiKey();

  if (!apiKey) {
    return NextResponse.json({ code: 500, message: "缺少 SEEDANCE_API_KEY，请先在 .env.local 中配置。" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get("group_id") || DEFAULT_GROUP_ID;
  const groupName = searchParams.get("group_name") || DEFAULT_GROUP_NAME;
  const page = Number(searchParams.get("page") || 1);
  const pageSize = Number(searchParams.get("page_size") || 20);
  const assetType = Number(searchParams.get("asset_type") || 0);
  const keyword = searchParams.get("keyword") || "";

  const response = await fetchWithTimeout(`${BASE_URL}/ai-open-platform-api/v1/asset/list`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ApiKey: apiKey },
    body: JSON.stringify({
      group_id: groupId,
      asset_type: assetType,
      keyword,
      page,
      page_size: pageSize
    })
  }, 30000);

  const text = await response.text();
  let result: SeedanceResponse<ListAssetsData> = { code: response.status, message: text };
  try { result = text ? JSON.parse(text) as SeedanceResponse<ListAssetsData> : result; } catch { result = { code: response.status, message: text || "查询外接资产失败" }; }

  if (!response.ok || result.code !== 0 || !result.data) {
    return NextResponse.json(
      { code: result.code || response.status, message: result.message || "查询外接资产失败", trace_id: result.trace_id },
      { status: response.ok ? 400 : response.status }
    );
  }

  return NextResponse.json({
    code: 0,
    message: result.message || "",
    trace_id: result.trace_id,
    group_id: String(groupId),
    total: result.data.total,
    page: result.data.page,
    page_size: result.data.page_size,
    data: result.data.list.map(item => toVisualAsset(item, groupName))
  });
}

export async function POST(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });

  const apiKey = getApiKey();

  if (!apiKey) {
    return NextResponse.json({ code: 500, message: "缺少 SEEDANCE_API_KEY，请先在 .env.local 中配置。" }, { status: 500 });
  }

  const body = await request.json() as {
    group_id?: string | number;
    url?: string;
    asset_name?: string;
    asset_type?: number;
  };

  if (!body.group_id || !body.url || !body.asset_type) {
    return NextResponse.json({ code: 400, message: "创建资产需要 group_id、url、asset_type。" }, { status: 400 });
  }

  const response = await fetchWithTimeout(`${BASE_URL}/ai-open-platform-api/v1/asset/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ApiKey: apiKey },
    body: JSON.stringify({
      group_id: body.group_id,
      url: body.url,
      asset_name: body.asset_name || "漫镜视频素材",
      asset_type: body.asset_type
    })
  }, 30000);

  const result = await response.json() as SeedanceResponse<CreateAssetData>;

  if (!response.ok || result.code !== 0 || !result.data?.id) {
    return NextResponse.json(
      { code: result.code || response.status, message: result.message || "创建资产失败", trace_id: result.trace_id },
      { status: response.ok ? 400 : response.status }
    );
  }

  return NextResponse.json({
    code: 0,
    data: {
      id: result.data.id,
      asset_url: `asset://${result.data.id}`
    }
  });
}
