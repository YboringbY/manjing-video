import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    data: [],
    message: "项目列表接口已预留，后续接入数据库后返回真实项目。"
  });
}

export async function POST(request: Request) {
  const body = await request.json();

  return NextResponse.json({
    data: {
      id: `project_${Date.now()}`,
      ...body,
      createdAt: new Date().toISOString()
    },
    message: "项目创建接口已预留。"
  });
}
