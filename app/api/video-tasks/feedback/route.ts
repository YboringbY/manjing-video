import { NextResponse } from "next/server";
import { getCurrentMembership } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { publicVideoTask } from "@/lib/video-task";

export async function PATCH(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });
  const body = await request.json();
  const projectId = Number(body.projectId);
  const taskId = String(body.taskId || "").trim();
  const rating = String(body.rating || "").trim();
  const feedback = String(body.feedback || "").trim();
  if (!Number.isInteger(projectId) || projectId <= 0 || !taskId || !["satisfied", "unsatisfied"].includes(rating)) {
    return NextResponse.json({ code: 400, message: "评价参数不正确。" }, { status: 400 });
  }
  if (feedback.length > 500) return NextResponse.json({ code: 400, message: "备注最多 500 个字符。" }, { status: 400 });
  const task = await prisma.videoTask.findFirst({ where: { tenantId: membership.tenantId, projectId, id: taskId } });
  if (!task) return NextResponse.json({ code: 404, message: "生成任务不存在。" }, { status: 404 });
  if (task.status !== "done") return NextResponse.json({ code: 409, message: "只有已完成的视频可以评价。" }, { status: 409 });
  const updated = await prisma.videoTask.update({
    where: { tenantId_projectId_id: { tenantId: membership.tenantId, projectId, id: taskId } },
    data: { rating, feedback: feedback || null }
  });
  await logAudit({ request, actor: membership, action: "video_task.feedback", targetType: "video_task", targetId: taskId, metadata: { projectId, rating, hasFeedback: Boolean(feedback), profileId: task.apiProfileId, model: task.snapshot && typeof task.snapshot === "object" && !Array.isArray(task.snapshot) ? (task.snapshot as Record<string, unknown>).model : undefined } });
  return NextResponse.json({ code: 0, data: publicVideoTask(updated) });
}
