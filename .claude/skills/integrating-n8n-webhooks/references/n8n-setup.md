# Налаштування на боці n8n (для передачі клієнту словами)

Воркфлоу клієнта — його власність: JSON воркфлоу не експортуємо й не імпортуємо. Нижче — текст, який можна
передати тому, хто налаштовує n8n.

1. **Webhook:** POST, Path = ім'я події (`quote-request`). Authentication — **Header Auth**, credential з Name
   `x-n8n-token`, Value = `N8N_WEBHOOK_TOKEN`. Respond — `Using 'Respond to Webhook' Node` (для швидких подій —
   `Immediately`). Фіксовані IP хостингу — Options → IP(s) Allowlist (за reverse proxy — `N8N_PROXY_HOPS`).
   Дані в наступних вузлах — `$json.body`, заголовки — `$json.headers` (у нижньому регістрі).
2. **Remove Duplicates:** «Remove Items Processed in Previous Executions», значення
   `{{ $json.headers['idempotency-key'] }}`.
3. **Respond to Webhook:** JSON, Response Code `202`, тіло `{"job_id": "{{ $execution.id }}"}`.
4. … робота воркфлоу …
5. **Edit Fields:** `ts` = `{{ Math.floor($now.toSeconds()) }}`, `body` =
   `{{ JSON.stringify({ version: 1, event: 'quote-request.completed', data: { jobId: $execution.id, … } }) }}`.
   Підписуємо й відправляємо **той самий рядок**.
6. **Crypto (v2):** Hmac, SHA256, HEX, значення `{{ $json.ts + '.' + $json.body }}`, credential Crypto з Hmac
   Secret = `N8N_CALLBACK_SECRET`.
7. **HTTP Request:** POST на `{{ $('Webhook').item.json.body.callbackUrl }}`; заголовки `x-n8n-timestamp`,
   `x-n8n-signature` (`sha256=` + результат Crypto), `idempotency-key`
   (`{{ $execution.id }}:quote-request.completed`), `x-correlation-id` (з вхідних заголовків). Body Content Type
   **Raw**, Content Type `application/json`, Body = поле `body`. Timeout `10000`; Retry On Fail, Max Tries 3,
   Wait 1000. n8n у Docker, застосунок на хості — `host.docker.internal`, не `localhost`.
8. **Save** і **Publish** (після кожної зміни — Publish знову).

Чому Raw, а не «JSON → Using Fields Below»: n8n не гарантує, що серіалізація полів дасть ті самі байти, що
підписали.

## Відомі пастки в документації й чужих скілах

- Документація пише «Workflow got started», код n8n повертає `{"message":"Workflow was started"}` — текст не
  парсимо.
- Офіційний пакет скілів n8n пише, що Header Auth відхиляє з **401**; код n8n повертає **403**. 401 — для
  Basic Auth і JWT.
- Той самий пакет пише, що секрет вузла Crypto не прив'язується до credential; для Crypto v2 це вже не так.
- Приклад вебхука в документації Next.js передає токен у `?token=` у GET і порівнює через `!==`. Ми — суворіше:
  токен у заголовку, підпис, `timingSafeEqual`.

## Поза межами скіла

Побудова й зміна воркфлоу в редакторі n8n, експорт/імпорт JSON, код для вузла Code, черги й фонові воркери.

## Реєстр інтеграцій проєкту

Кожна інтеграція — рядок у `docs/n8n-integrations.md`:

| event | напрям | шлях n8n | режим | власник |
|---|---|---|---|---|
| `quote-request` | Next.js → n8n → колбек | `/webhook/quote-request` | Respond to Webhook 202 + колбек | ім'я відповідального |
