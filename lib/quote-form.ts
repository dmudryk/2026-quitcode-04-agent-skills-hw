export const DESCRIPTION_MAX_LENGTH = 2000;
export const BUDGET_MAX_USD = 1_000_000;

export type QuoteFormField = "company" | "email" | "description" | "budget";

export type QuoteFormData = {
  company: string;
  email: string;
  description: string;
  budget: number | null;
};

// What the user typed, sent back on errors so the form keeps it.
export type QuoteFormValues = Record<QuoteFormField, string>;

export type QuoteParseResult =
  | { ok: true; data: QuoteFormData }
  | { ok: false; errors: Partial<Record<QuoteFormField, string>>; values: QuoteFormValues };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(formData: FormData, name: QuoteFormField, max: number) {
  const value = formData.get(name);
  // Browsers submit textarea line breaks as CRLF but count them as one character
  // for maxLength, so normalize before cutting.
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim().slice(0, max) : "";
}

export function parseQuoteForm(formData: FormData): QuoteParseResult {
  const values: QuoteFormValues = {
    company: text(formData, "company", 120),
    email: text(formData, "email", 200).toLowerCase(),
    description: text(formData, "description", DESCRIPTION_MAX_LENGTH),
    budget: text(formData, "budget", 12).replace(/\s/g, ""),
  };

  const errors: Partial<Record<QuoteFormField, string>> = {};

  if (!values.company) errors.company = "Вкажіть назву компанії";
  if (!EMAIL_RE.test(values.email)) errors.email = "Перевірте email";
  if (values.description.length < 10) errors.description = "Опишіть задачу хоча б одним реченням";

  let budget: number | null = null;
  if (values.budget) {
    budget = /^\d+$/.test(values.budget) ? Number(values.budget) : NaN;
    if (!(budget >= 1 && budget <= BUDGET_MAX_USD)) {
      errors.budget = `Вкажіть суму цілим числом від 1 до ${BUDGET_MAX_USD.toLocaleString("uk-UA")}`;
    }
  }

  return Object.keys(errors).length > 0
    ? { ok: false, errors, values }
    : { ok: true, data: { company: values.company, email: values.email, description: values.description, budget } };
}
