"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actOnReview, setReviewStatus } from "@/lib/monthly";

export async function actAction(form: FormData): Promise<void> {
  const topicId = await actOnReview(String(form.get("id")));
  revalidatePath("/review");
  redirect(`/topics/${topicId}`);
}

export async function statusAction(form: FormData): Promise<void> {
  const status = String(form.get("status"));
  if (!["open", "done", "dismissed"].includes(status)) throw new Error("bad status");
  await setReviewStatus(String(form.get("id")), status as "open" | "done" | "dismissed");
  revalidatePath("/review");
}
