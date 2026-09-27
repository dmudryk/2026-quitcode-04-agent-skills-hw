"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { after } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getCurrentUser, getWorkspace } from "@/lib/data";
import { parseLeadForm, type LeadFormField } from "@/lib/lead-form";
import { operationKey, triggerWorkflow } from "@/lib/n8n/client";
import { parseNoteForm, type NoteFormData, type NoteFormField } from "@/lib/note-form";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/types";

const PUBLIC_FORM_WORKSPACE_ID = "ws_studio_nova";

export type SubmitLeadState =
  | { status: "idle" }
  | { status: "invalid"; errors: Partial<Record<LeadFormField, string>> }
  | { status: "ok" };

export async function submitLead(
  _prevState: SubmitLeadState,
  formData: FormData,
): Promise<SubmitLeadState> {
  const parsed = parseLeadForm(formData);
  if (!parsed.ok) {
    return { status: "invalid", errors: parsed.errors };
  }

  const requestHeaders = await headers();
  const ipAddress = requestHeaders.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1";
  const userAgent = requestHeaders.get("user-agent") ?? "";

  const lead = await db.insertLead({
    ...parsed.data,
    workspaceId: PUBLIC_FORM_WORKSPACE_ID,
    jobTitle: "",
    city: "",
    country: "",
    source: "website",
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    ipAddress,
    userAgent,
    rawPayload: {
      form: { id: "contact-main", version: "2026-07", fields: parsed.data },
      request: {
        ip: ipAddress,
        userAgent,
        acceptLanguage: requestHeaders.get("accept-language"),
        receivedAt: new Date().toISOString(),
      },
    },
  });

  // The visitor does not wait for n8n or the audit log. lead-created is an
  // Immediately webhook ("for information"): no callback, only what the workflow
  // needs — no contact details, IP or raw form data.
  after(async () => {
    try {
      await triggerWorkflow(
        "lead-created",
        { leadId: lead.id, company: lead.company, budget: lead.budget, source: lead.source, createdAt: lead.createdAt },
        { idempotencyKey: operationKey("lead-created", lead.id), correlationId: randomUUID(), withCallback: false },
      );
    } catch (error) {
      console.error(`n8n -> lead-created not sent: ${error instanceof Error ? error.message : "Error"}`);
    }
  });
  after(() => logAudit("lead.created", lead.id));

  return { status: "ok" };
}

// Server Actions are public POST endpoints: check the session and the lead's
// workspace inside every action, not only in proxy.ts or the page.
async function requireLeadInCurrentWorkspace(id: unknown) {
  const user = await getCurrentUser();
  if (typeof id !== "string") throw new Error("Lead not found");

  const [workspace, lead] = await Promise.all([getWorkspace(user.workspaceSlug), db.getLead(id)]);
  if (!lead || lead.workspaceId !== workspace.id) throw new Error("Lead not found");
  return lead;
}

export async function updateLeadStatus(id: string, status: LeadStatus) {
  if (!LEAD_STATUSES.includes(status)) throw new Error("Invalid status");
  await requireLeadInCurrentWorkspace(id);

  await db.updateLeadStatus(id, status);
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${id}`);
}

export async function deleteLead(id: string) {
  await requireLeadInCurrentWorkspace(id);

  await db.deleteLead(id);
  revalidatePath("/dashboard");
}

export type AddLeadNoteState =
  | { status: "idle" }
  | { status: "invalid"; errors: Partial<Record<NoteFormField, string>>; values: Partial<NoteFormData> }
  | { status: "ok" }
  | { status: "error"; values: Partial<NoteFormData> };

// leadId comes from a hidden form field, not from `.bind()`: in Next.js 16.3.5 a
// bound action in useActionState never responds when submitted without
// JavaScript. It is untrusted input: requireLeadInCurrentWorkspace checks its
// type and that the lead belongs to the user's workspace.
export async function addLeadNote(
  _prevState: AddLeadNoteState,
  formData: FormData,
): Promise<AddLeadNoteState> {
  await getCurrentUser();

  const parsed = parseNoteForm(formData);
  if (!parsed.ok) {
    return { status: "invalid", errors: parsed.errors, values: parsed.values };
  }

  let leadId: string;
  try {
    const lead = await requireLeadInCurrentWorkspace(formData.get("leadId"));
    leadId = lead.id;
    const saved = await db.appendLeadNote(leadId, parsed.data.text);
    if (!saved) throw new Error("Lead not found");
  } catch (error) {
    unstable_rethrow(error);
    console.error(`lead.note_added failed: ${error instanceof Error ? error.name : "UnknownError"}`);
    // Give the text back so the form can restore it: the user did nothing wrong.
    return { status: "error", values: { text: parsed.data.text } };
  }

  after(() => logAudit("lead.note_added", leadId));
  revalidatePath(`/dashboard/leads/${leadId}`);
  return { status: "ok" };
}
