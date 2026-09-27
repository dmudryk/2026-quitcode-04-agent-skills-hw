"use client";

import { useActionState } from "react";
import { requestQuote, type RequestQuoteState } from "@/app/quotes/actions";
import { BUDGET_MAX_USD, DESCRIPTION_MAX_LENGTH } from "@/lib/quote-form";

const initialState: RequestQuoteState = { status: "idle" };

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export function QuoteForm() {
  const [state, formAction, pending] = useActionState(requestQuote, initialState);
  const errors = state.status === "invalid" ? state.errors : {};
  const values = state.status === "invalid" ? state.values : undefined;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.status === "invalid" && (
        <p role="alert" className="text-sm text-red-700">
          Запит не надіслано: виправте поля нижче.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Компанія
          <input
            name="company"
            autoComplete="organization"
            required
            maxLength={120}
            defaultValue={values?.company}
            aria-invalid={errors.company ? true : undefined}
            aria-describedby={errors.company ? "quote-company-error" : undefined}
            className={inputClass}
          />
          {errors.company && <span id="quote-company-error" className="mt-1 block text-xs text-red-600">{errors.company}</span>}
        </label>
        <label className="block text-sm font-medium">
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={200}
            defaultValue={values?.email}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "quote-email-error" : undefined}
            className={inputClass}
          />
          {errors.email && <span id="quote-email-error" className="mt-1 block text-xs text-red-600">{errors.email}</span>}
        </label>
      </div>

      <label className="block text-sm font-medium">
        Опис задачі
        <textarea
          name="description"
          rows={5}
          required
          maxLength={DESCRIPTION_MAX_LENGTH}
          defaultValue={values?.description}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? "quote-description-error" : undefined}
          className={inputClass}
        />
        {errors.description && <span id="quote-description-error" className="mt-1 block text-xs text-red-600">{errors.description}</span>}
      </label>

      <label className="block text-sm font-medium">
        Бюджет, $ <span className="font-normal text-slate-500">(необов&apos;язково)</span>
        <input
          name="budget"
          type="number"
          inputMode="numeric"
          min={1}
          max={BUDGET_MAX_USD}
          step={1}
          defaultValue={values?.budget}
          aria-invalid={errors.budget ? true : undefined}
          aria-describedby={errors.budget ? "quote-budget-error" : undefined}
          className={inputClass}
        />
        {errors.budget && <span id="quote-budget-error" className="mt-1 block text-xs text-red-600">{errors.budget}</span>}
      </label>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {pending ? "Надсилаємо…" : "Отримати кошторис"}
      </button>
    </form>
  );
}
