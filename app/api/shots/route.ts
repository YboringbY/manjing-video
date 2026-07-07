import { NextResponse } from "next/server";
import { getCurrentMembership } from "@/lib/auth";

export async function GET() {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });

  return NextResponse.json({ code: 410, message: "分镜接口尚未启用，当前分镜仍保存在项目工作区中。" }, { status: 410 });
}

export async function POST() {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });

  return NextResponse.json({ code: 410, message: "分镜创建接口尚未启用，当前请通过项目工作区保存分镜。" }, { status: 410 });
}
