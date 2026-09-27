import type { Metadata } from "next";
import { QuoteForm } from "@/components/quote-form";

export const metadata: Metadata = {
  title: "Запит на кошторис",
};

export default function NewQuotePage() {
  return (
    <main className="mx-auto grid w-full max-w-5xl flex-1 gap-10 px-6 py-12 md:grid-cols-[1fr_1.2fr]">
      <section className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">Запит на кошторис</h1>
        <p className="text-slate-600">
          Опишіть задачу — ми підготуємо PDF-кошторис автоматично. Зазвичай це займає одну-дві
          хвилини.
        </p>
        <ul className="space-y-2 text-sm text-slate-600">
          <li>• Після надсилання відкриється сторінка зі статусом запиту</li>
          <li>• Збережіть її адресу, щоб повернутися до кошторису пізніше</li>
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <QuoteForm />
      </section>
    </main>
  );
}
