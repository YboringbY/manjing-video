import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    data: [],
    message: "分镜列表接口已预留，后续按 projectId 查询。"
  });
}

export async function POST(request: Request) {
  const body = await request.json();

  return NextResponse.json({
    data: {
      id: `shot_${Date.now()}`,
      status: "pending",
      ...body,
      createdAt: new Date().toISOString()
    },
    message: "分镜创建接口已预留。"
  });
}
