import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { fetchWithTimeout } from "@/lib/http";

type SeedanceResponse<T> = {
  code: number;
  message?: string;
  trace_id?: string;
  data?: T;
};

type BalanceData = {
  wallet_balance: number;
};

const BASE_URL = process.env.SEEDANCE_BASE_URL || "https://aiopenapi.kuaizi.cn";

export async function POST() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const apiKey = process.env.SEEDANCE_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { code: 500, message: "缺少 SEEDANCE_API_KEY，请先在 .env.local 中配置。" },
      { status: 500 }
    );
  }

  const response = await fetchWithTimeout(`${BASE_URL}/ai-open-platform-api/v1/user/balance`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ApiKey: apiKey
    },
    body: JSON.stringify({})
  }, 30000);

  const result = await response.json() as SeedanceResponse<BalanceData>;

  if (!response.ok || result.code !== 0 || !result.data) {
    return NextResponse.json(
      {
        code: result.code || response.status,
        message: result.message || "查询余额失败",
        trace_id: result.trace_id
      },
      { status: response.ok ? 400 : response.status }
    );
  }

  return NextResponse.json({
    code: 0,
    data: {
      wallet_balance: result.data.wallet_balance,
      points: result.data.wallet_balance / 100
    }
  });
}
