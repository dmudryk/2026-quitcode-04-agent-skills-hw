# Інтеграції з n8n

Контракт — скіл `.claude/skills/integrating-n8n-webhooks`. Усі виклики n8n — лише з `lib/n8n/client.ts`,
колбеки — `app/api/n8n/[event]/route.ts`. Змінні: `N8N_WEBHOOK_BASE_URL`, `N8N_WEBHOOK_TOKEN`,
`N8N_CALLBACK_SECRET`, `APP_BASE_URL` (лише серверні, приклад — `.env.example`).

| event | напрям | шлях n8n | режим | власник |
|---|---|---|---|---|
| `quote-request` | Next.js → n8n → колбек | `/webhook/quote-request` | Respond to Webhook 202 + колбек | _уточнити_ |

## `quote-request` — PDF-кошторис (40–90 с)

- **Хто запускає:** Server Action `requestQuote` (`app/quotes/actions.ts`), форма `/quotes/new`. Запис
  зберігається зі статусом `queued`, виклик n8n — в `after()`, користувач одразу бачить `/quotes/<id>`.
- **Запит у n8n:** `POST ${N8N_WEBHOOK_BASE_URL}/quote-request`, заголовки `x-n8n-token`, `idempotency-key`,
  `x-correlation-id`; тіло
  `{ "version": 1, "event": "quote-request", "data": { "quoteId", "company", "description", "budget" }, "callbackUrl" }`.
  `budget` — ціле число в доларах або `null`. Email у n8n не передається.
- **Очікувана відповідь:** `202 {"job_id": "…"}` одразу (Respond to Webhook). 4xx не повторюється, 5xx/524/мережа —
  до 3 спроб з тим самим `idempotency-key`.
- **Колбек:** `POST ${APP_BASE_URL}/api/n8n/quote-request`, підпис `x-n8n-signature` =
  `sha256=<hex HMAC-SHA256(N8N_CALLBACK_SECRET, "<x-n8n-timestamp>.<raw body>")>`, `idempotency-key` =
  `<data.jobId>:<event>`. Тіло:
  `{ "version": 1, "event": "quote-request.completed", "data": { "jobId", "status": "completed", "requestIdempotencyKey", "result": { "documentUrl" } } }`;
  при збої — `event: "quote-request.failed"`, `status: "failed"`. `documentUrl` — лише `http(s)`.
- **Статуси на `/quotes/<id>`:** `queued` → `processing` (n8n прийняв) → `ready` (посилання на PDF) або `failed`.

### Що налаштувати в n8n (для клієнта)

1. Webhook: POST, Path `quote-request`, Header Auth (Name `x-n8n-token`), Respond — Using 'Respond to Webhook' Node.
2. Remove Duplicates за `{{ $json.headers['idempotency-key'] }}`.
3. Respond to Webhook: код `202`, тіло `{"job_id": "{{ $execution.id }}"}`.
4. Після генерації PDF: зібрати тіло колбека одним рядком, підписати його вузлом Crypto (Hmac SHA256, HEX,
   значення `ts + '.' + body`) і відправити HTTP Request з Body Content Type **Raw** на `callbackUrl` із запиту.
   `requestIdempotencyKey` = вхідний заголовок `idempotency-key`. Retry On Fail: 3 спроби, 1000 мс.
5. Publish (після кожної зміни — знову).

У коді й `.env.example` — лише production-адреса `/webhook/…`, тестова `/webhook-test/…` не використовується.
