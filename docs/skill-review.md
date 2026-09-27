# Рев'ю стороннього скіла: `vercel-react-best-practices`

> Рев'ю зроблено **до** встановлення: цей файл закомічено раніше за коміт, який додає
> `.claude/skills/vercel-react-best-practices/` і `skills-lock.json` (видно в `git log`).
> Файли скіла читали як дані: нічого з них не виконували, клон не відкривали як проєкт в агенті.

**Дата, інструмент, ОС:** 27.09.2026 · Claude Code (розширення VS Code, модель Opus 5.5) · Windows 10 Pro 19045 + Git Bash · skills CLI `skills@1.7.0`

## Що рев'юємо

| | |
|---|---|
| Репозиторій | <https://github.com/vercel-labs/agent-skills> |
| Тека в репозиторії → `name` | `skills/react-best-practices` → `name: vercel-react-best-practices` (назва теки в джерелі й `name` різні; у нашому проєкті тека буде `vercel-react-best-practices`, тобто дорівнюватиме `name`) |
| Версія | тег `agent-skills-063bee94c3f4df8453406c830b0a7df0f2860278` = коміт `063bee94c3f4df8453406c830b0a7df0f2860278` (28.08.2026, merge PR #328) |
| Навіщо нам | клієнт скаржиться, що `/dashboard` відкривається понад 2 с, а форма «думає»; експерта з продуктивності React у команді немає |

## 1. Подивитись, не встановлюючи

- Як дивились:
  1. `DISABLE_TELEMETRY=1 npx skills@1.7.0 add "vercel-labs/agent-skills#agent-skills-063bee9…" --list`:
     CLI показав 10 скілів пакета з описами (`vercel-react-best-practices`, `vercel-composition-patterns`,
     `deploy-to-vercel`, `vercel-cli-with-tokens`, `vercel-optimize` …). `git status` після цього — без змін у
     репозиторії.
  2. `git clone --depth 1 --branch agent-skills-063bee9… https://github.com/vercel-labs/agent-skills.git ../review-agent-skills`
     (поза репозиторієм); `git rev-parse HEAD` = `063bee94c3f4df8453406c830b0a7df0f2860278`.
- Склад скіла (`skills/react-best-practices`, **76 файлів**):

  | Файл / тека | Розмір | Що це |
  |---|---|---|
  | `SKILL.md` | 7,4 КБ | frontmatter + перелік 70 правил за 8 категоріями з пріоритетами |
  | `AGENTS.md` | 112 КБ | «скомпільований» документ з усіма правилами в одному файлі |
  | `README.md` | 3,5 КБ | опис для людей |
  | `metadata.json` | 0,9 КБ | версія 1.0.0, «Vercel Engineering», список посилань; CLI його не копіює (у встановленому скілі буде 75 файлів) |
  | `rules/*.md` | 72 файли, 115 КБ | 70 правил (`async-*`, `bundle-*`, `server-*`, `client-*`, `rerender-*`, `rendering-*`, `js-*`, `advanced-*`) + `_sections.md` і `_template.md` |

- Frontmatter `SKILL.md`: `name`, `description`, `license: MIT`, `metadata` (`author: vercel`, `version: "1.0.0"`).
  Полів `allowed-tools`, `hooks`, `context`, `model` **немає**.

## 2. Що скіл може виконати, завантажити чи змінити

| Перевірка | Результат | Як перевіряли |
|---|---|---|
| `scripts/` та інші виконувані файли | Немає. Єдиний не-`.md` файл — `metadata.json` (дані) | `find "$S" -type f ! -name "*.md"` |
| `allowed-tools` | Немає: скіл не отримує попередніх дозволів на інструменти | frontmatter через `awk` |
| Команди під час рендеру `` !`cmd` `` | Немає | `grep -rn '!`' "$S"` → 0 збігів |
| Хуки, MCP-сервери, `plugin.json`, API-ключі | Немає файлів `*hooks*.json`, `*mcp*.json`, `plugin.json`, `settings*.json`; про ключі не згадується | `find … -name "*hooks*.json" -o …` → порожньо |
| Інструкції агенту щось завантажити чи виконати | Один збіг: `npx svgo --precision=1 --multipass icon.svg` у `rules/rendering-svg-precision.md:27` (і його копія в `AGENTS.md:2477`). Це приклад для розробника в блоці коду, а не вказівка агенту виконати; до нашої задачі не стосується. `curl`/`wget`/`WebFetch` — 0 | `grep -rnE "npx \|curl \|wget \|Invoke-WebRequest\|WebFetch"` |
| Посилання | ~35 унікальних: react.dev, nextjs.org, vercel.com/blog, MDN, swr.vercel.app, github.com (better-all, lru-cache), документація webpack/vite/esbuild, плюс `example.com` у прикладах коду. Жодне не каже «прочитай інструкції звідси» | `grep -rhoE "https?://…" \| sort \| uniq -c` |
| Приховані інструкції | HTML-коментарів, «ignore previous», «system prompt» — 0; файлів із zero-width символами — 0; base64-блоків (≥ 80 символів) — 0 | `grep -rniE "ignore … previous\|system prompt\|<!--"`, node-скрипт з шаблону, `grep -rnoE "[A-Za-z0-9+/]{80,}"` |

## 3. Аудити

| Аудит | Результат | Дата аналізу |
|---|---|---|
| Gen (Agent Trust Hub) | Pass, ризик SAFE; як загальний ризик для будь-якого скіла, що обробляє код користувача, названо непряму prompt injection | 14.09.2026 |
| Socket | Pass: немає ознак шкідливої поведінки, витоку облікових даних, обфускації чи розвідки | 14.09.2026 |
| Snyk | Pass, ризик LOW, «No issues detected» | 14.09.2026 |

- Де взяли: <https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices> і сторінки `…/security/{agent-trust-hub,socket,snyk}`.
  Там же: 746,6 тис. встановлень, 31,6 тис. зірок репозиторію, «First Seen Jan 19, 2026».
- Чому CLI не показав блок «Security Risk Assessments»: команду `--list` запускали з `DISABLE_TELEMETRY=1`,
  а з нею CLI аудити не завантажує. Крім того, у сесії агента CLI сам вмикає `--yes`, тож підтвердження
  з аудитами агент би й не побачив. Тому аудити читали на skills.sh.
- До чого прив'язаний аудит: **не до нашого тега**. Сторінки прив'язані до «репозиторій + назва скіла»;
  Socket указує ідентифікатор пакета з хешем вмісту
  `…vercel-react-best-practices/@ca7b0c0c6e5f2750043f7f0cd72d16ac4e2abc48f9b5500d047a4b77a2506212`, без тега
  чи SHA коміту. Звірили самі: `git ls-remote` показує, що `main` у vercel-labs досі = `063bee9…` (наш тег),
  а аудит (14.09) новіший за коміт (28.08). Отже, **на сьогодні** аудит стосується того самого вмісту, що
  ми ставимо. Щойно `main` зрушить, сторінка skills.sh описуватиме вже іншу версію, тому на аудит не
  покладаємось без власного рев'ю (розділ 2).

## 4. Ліцензія й походження

- Ліцензія: MIT. Заявлена у frontmatter `SKILL.md` (`license: MIT`) і в розділі «License» кореневого `README.md`
  репозиторію. Окремого файла `LICENSE` у корені тега **немає** — це слабке місце: текст ліцензії з
  іменем правовласника ніде не наведено. Для внутрішнього використання вважаємо MIT достатнім.
- Видавець і активність: організація `vercel-labs` (Vercel), автор `metadata.author: vercel`; коміт тега від
  28.08.2026 (Aurora Scharff, merge PR #328); 31,6 тис. зірок, 746,6 тис. встановлень, у каталозі skills.sh
  із 19.01.2026. Пакет активно підтримується.

## 5. Чи правдивий зміст для нашого стеку

Звіряли з документацією Next.js 16.3.5 у `node_modules/next/dist/docs/` і з кодом `node_modules/next/dist/server/config.js`.

| Порада скіла (id) | Що каже скіл | Що каже документація нашої версії | Висновок |
|---|---|---|---|
| `async-parallel` | незалежні `await` — у `Promise.all()` | `01-app/01-getting-started/06-fetching-data.md` → «Parallel data fetching»: послідовні `await` в одному компоненті блокують один одного; радить `Promise.all` (і `allSettled`, якщо часткова відмова допустима) | **Діє.** Застосовуємо до `app/dashboard/page.tsx` |
| `server-cache-react` | `React.cache()` для дедуплікації запитів у межах одного запиту, особливо автентифікації | `01-app/02-guides/data-security.md`: приклад `export const getCurrentUser = cache(async () => …)`; `after.md`: `cache` дедуплікує й усередині `after` | **Діє.** Застосовуємо до `getCurrentUser` у `lib/data.ts` |
| `server-auth-actions` | Server Action — публічний ендпоінт, сесію й права перевіряти всередині | `01-app/01-getting-started/07-mutating-data.md:32`: «reachable via direct POST requests… verify authentication and authorization inside every Server Function»; `02-guides/authentication.md:1463` | **Діє.** Застосовуємо до `updateLeadStatus` / `deleteLead` |
| `bundle-barrel-imports` | серед «уражених» бібліотек названо `lodash`; радить `optimizePackageImports` або прямі імпорти | `next.config` за замовчуванням (`server/config.js`): `modularizeImports.lodash → 'lodash/{{member}}'`, а `recharts` уже в стандартному списку `optimizePackageImports` (`05-config/01-next-config-js/optimizePackageImports.md`) | **У нашій версії не потрібна.** `import { debounce } from "lodash"` і імпорти `recharts` Next.js оптимізує сам; додавати їх у конфіг чи переписувати імпорти — зайва зміна |
| `bundle-dynamic-imports` | `next/dynamic(…, { ssr: false })` для важких компонентів | `01-app/02-guides/lazy-loading.md:94`: «`ssr: false` option is not supported in Server Components. You will see an error…» | **Діє лише в Client Component.** Приклад скіла без `"use client"`, скопійований у Server Component, ламає збірку |

## 6. Закріплення версії й коміт

- Команда встановлення (запускає людина у своєму терміналі, не агент — інакше CLI вмикає `--yes`):
  ```bash
  DISABLE_TELEMETRY=1 npx skills@1.7.0 add vercel-labs/agent-skills#agent-skills-063bee94c3f4df8453406c830b0a7df0f2860278 \
    --skill vercel-react-best-practices -a claude-code --copy
  ```
  Scope — **Project**. `-a claude-code` без `cursor`: Cursor і так читає `.claude/skills/`, а з `cursor` CLI
  додав би другу копію в `.agents/skills/`.
- Де лягли файли; справжні файли чи посилання: очікуємо справжні файли (`--copy`) у
  `.claude/skills/vercel-react-best-practices/`, 75 шт., без `.agents/`. Факт — у `docs/verification.md`, Task A.
- Що потрапить у git: тека скіла й `skills-lock.json` (джерело, тег, хеш).
- Як оновлювати: та сама команда з новим тегом → `git diff .claude/skills/vercel-react-best-practices` →
  рев'ю змін за цим чеклістом (розділи 2–5) → окремий коміт. Файли скіла вручну не редагуємо.

## Вердикт

**Встановити з умовами.** Ризик низький: це лише markdown без скриптів, хуків, MCP і `allowed-tools`;
прихованих інструкцій немає; видавець — Vercel; три аудити Pass. Умови: (1) лише закріплений тег і
`--copy`, оновлення — через рев'ю діфа; (2) кожну пораду перед застосуванням звіряємо з
`node_modules/next/dist/docs/`, бо скіл не прив'язаний до версії Next.js (`bundle-barrel-imports` у
16.3.5 зайва, `ssr: false` — лише в Client Component); (3) аудит skills.sh не прив'язаний до тега, тож
він не замінює власного рев'ю при оновленні.
