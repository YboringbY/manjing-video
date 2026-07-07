import { NextResponse } from "next/server";
import { getCurrentMembership } from "@/lib/auth";

export async function GET() {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });

  return NextResponse.json({ code: 410, message: "项目接口尚未启用，请使用 /api/workspaces 读取项目工作区。" }, { status: 410 });
}

export async function POST() {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });

  return NextResponse.json({ code: 410, message: "项目创建接口尚未启用，请使用 /api/workspaces 保存项目工作区。" }, { status: 410 });
}
