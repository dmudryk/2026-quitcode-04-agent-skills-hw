"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { triggerWorkflow, type TriggerResult } from "@/lib/n8n/client";
import { parseQuoteForm, type QuoteFormField, type QuoteFormValues } from "@/lib/quote-form";
import { insertQuote, markQuoteTriggered } from "@/lib/quotes";

export type RequestQuoteState =
  | { status: "idle" }
  | { status: "invalid"; errors: Partial<Record<QuoteFormField, string>>; values: QuoteFormValues };

// Public form by design, like submitLead: no session. A Server Action is a public
// POST endpoint, so everything the user sends is validated here.
export async function requestQuote(
  _prevState: RequestQuoteState,
  formData: FormData,
): Promise<RequestQuoteState> {
  const parsed = parseQuoteForm(formData);
  if (!parsed.ok) {
    return { status: "invalid", errors: parsed.errors, values: parsed.values };
  }

  const quote = await insertQuote(parsed.data);

  // The workflow runs 40–90 s: n8n answers 202 at once and reports the PDF to
  // /api/n8n/quote-request. The user does not wait even for the 202 — the call
  // and its retries run after the redirect.
  after(async () => {
    let result: TriggerResult;
    try {
      result = await triggerWorkflow(
        "quote-request",
        // Only what the workflow needs: no email, no request metadata.
        { quoteId: quote.id, company: quote.company, description: quote.description, budget: quote.budget },
        { idempotencyKey: quote.idempotencyKey, correlationId: quote.correlationId, withCallback: true },
      );
    } catch (error) {
      // Configuration errors (missing N8N_* / APP_BASE_URL) — no values in the message.
      console.error(`n8n -> quote-request not sent: ${error instanceof Error ? error.message : "Error"} correlation=${quote.correlationId}`);
      result = { ok: false, status: null };
    }
    await markQuoteTriggered(quote.id, result);
  });

  redirect(`/quotes/${quote.id}`);
}
