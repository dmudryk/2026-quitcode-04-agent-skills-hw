import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QuoteStatusRefresher } from "@/components/quote-status-refresher";
import { getQuote, isQuoteOverdue, type QuoteStatus } from "@/lib/quotes";

// Anyone with the link can open this page: it shows the status and the PDF link,
// never the email or the task description.
export const metadata: Metadata = {
  title: "Статус кошторису",
  robots: { index: false, follow: false },
};

const dateTimeFormat = new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" });

const STATUS_LABELS: Record<QuoteStatus, string> = {
  queued: "Прийнято",
  processing: "Готуємо кошторис",
  ready: "Готово",
  failed: "Не вдалося",
};

const STATUS_STYLES: Record<QuoteStatus, string> = {
  queued: "bg-sky-50 text-sky-700 ring-sky-200",
  processing: "bg-amber-50 text-amber-700 ring-amber-200",
  ready: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  failed: "bg-red-50 text-red-700 ring-red-200",
};

export default async function QuotePage({ params }: PageProps<"/quotes/[id]">) {
  const { id } = await params;
  const quote = await getQuote(id);
  if (!quote) notFound();

  const inProgress = quote.status === "queued" || quote.status === "processing";
  const overdue = isQuoteOverdue(quote);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-6 py-12">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Кошторис для {quote.company}</h1>
        <p className="text-sm text-slate-500">Запит від {dateTimeFormat.format(new Date(quote.createdAt))}</p>
      </div>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div role="status" className="space-y-3">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[quote.status]}`}
          >
            {STATUS_LABELS[quote.status]}
          </span>

          {inProgress && !overdue && (
            <p className="text-slate-700">
              {quote.status === "queued" ? "Запит прийнято й передаємо в роботу." : "Готуємо PDF-кошторис."}{" "}
              Зазвичай це займає одну-дві хвилини — сторінка оновиться сама.
            </p>
          )}
          {inProgress && overdue && (
            <p className="text-slate-700">
              Кошторис готується довше, ніж зазвичай. Оновіть сторінку трохи пізніше — або ми
              зв&apos;яжемося з вами email-ом.
            </p>
          )}
          {quote.status === "ready" && quote.documentUrl && (
            <p className="text-slate-700">Кошторис готовий.</p>
          )}
          {quote.status === "failed" && (
            <p className="text-slate-700">
              Не вдалося підготувати кошторис автоматично. Спробуйте надіслати запит ще раз — або
              ми зв&apos;яжемося з вами email-ом.
            </p>
          )}
        </div>

        {quote.status === "ready" && quote.documentUrl && (
          <a
            href={quote.documentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Відкрити кошторис (PDF)
          </a>
        )}
        {quote.status === "failed" && (
          <Link
            href="/quotes/new"
            className="inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Новий запит
          </Link>
        )}
        {inProgress && (
          // Works without JavaScript too; with it the refresher below does the same every few seconds.
          <Link href={`/quotes/${quote.id}`} className="block text-sm text-slate-500 hover:text-slate-900">
            Оновити статус
          </Link>
        )}
      </section>

      {inProgress && !overdue && <QuoteStatusRefresher />}
    </main>
  );
}
