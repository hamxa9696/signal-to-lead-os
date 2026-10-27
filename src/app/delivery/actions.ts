"use server";
import { revalidatePath } from "next/cache";
import { ensureBrevoSetup } from "@/lib/brevo";
import { samplePayload, sendTestToMake } from "@/lib/make";
import { downloadBaseUrl } from "@/lib/magnet/storage";

export type State = { ok: boolean; message: string } | null;

export async function setupBrevoAction(): Promise<State> {
  try {
    const s = await ensureBrevoSetup();
    revalidatePath("/delivery");
    return { ok: true, message: `Brevo ready: list ${s.listId}, template ${s.templateId}` };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export async function testMakeAction(): Promise<State> {
  try {
    const r = await sendTestToMake(samplePayload(downloadBaseUrl()));
    return { ok: r.startsWith("2"), message: `Make replied ${r}` };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
