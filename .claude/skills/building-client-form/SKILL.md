---
name: building-client-form
description: >-
  Патерн команди для форм у Next.js 16 (App Router, React 19): Server Action з перевіркою сесії й
  валідацією всередині, useActionState, доступні помилки полів, форма працює без JavaScript, дія
  повертає лише { status, … }, без персональних даних у журналах, повільні побічні ефекти — в after().
  Use when adding or changing any form that submits data: заявка, кошторис, зворотний зв'язок,
  нотатка, коментар, налаштування, зміна статусу; when a Server Action is created or edited; when
  form errors are invisible or inaccessible. Тригери: «додай форму…», «форма заявки», «форма
  зворотного зв'язку», «додай поле в форму», «зроби Server Action для…», «помилки валідації не
  видно», «форма не працює без JS», «форма довго думає після надсилання», «add a form».
  Не для: пошуку й фільтрів через GET (звичайний <form action="/шлях">), форм входу через готову
  бібліотеку автентифікації, суто клієнтських контролів без збереження даних.
metadata:
  owner: Studio Nova / QuitCode
  version: "0.1.1"
---

# Клієнтська форма: патерн команди

Кожна форма в наших проєктах будується однаково: одна публічна точка входу (Server Action), яка сама
себе захищає, і форма, яку чує скрінрідер і яка працює без JavaScript. Це рішення команди, а не варіант
на вибір: відхилення — лише свідомо й письмово в PR.

## Коли застосовувати

- Нова форма або зміна наявної: поля, валідація, що відбувається після «Надіслати».
- Новий або змінений Server Action (`"use server"`), навіть без `<form>` (кнопка, `startTransition`).
- **Не** застосовувати: GET-пошук і фільтри; кнопки, що лише змінюють локальний стан UI.

## Як робимо

Три файли на форму (імена — за сутністю, напр. `note`):

| Файл | Що в ньому |
|---|---|
| `lib/<entity>-form.ts` | типи полів і стану + чиста функція `parse<Entity>Form(formData)` → `{ ok: true, data } \| { ok: false, errors, values }`. Без `"use server"` і без доступу до БД |
| `app/…/actions.ts` | `"use server"`; дія `(prevState, formData) => Promise<State>` |
| `components/<entity>-form.tsx` | `"use client"`; `useActionState(action, initialState)` |

**Порядок усередині дії — саме такий:**

1. **Хто викликає.** Server Action — публічний POST-ендпоінт: сесію й права перевіряємо тут, а не в
   `proxy.ts` чи на сторінці (правило Vercel [`server-auth-actions`](../vercel-react-best-practices/rules/server-auth-actions.md)). У LeadDesk — `getCurrentUser()` з
   `lib/data.ts` (у `cache()`, [`server-cache-react`](../vercel-react-best-practices/rules/server-cache-react.md)). Публічна форма без входу — позначаємо коментарем
   `// public form: no session by design`.
2. **Валідація** через `parse<Entity>Form`: `trim`, максимальна довжина кожного поля, перелік допустимих
   значень для `select`, `FormData.get` ніколи не довіряємо як типу. Помилка → повертаємо
   `{ status: "invalid", errors, values }`, де `values` — лише те, що користувач сам увів (не паролі).
3. **Права на ресурс:** запис, який змінюємо, належить workspace/користувачу з кроку 1. Незалежні
   запити (сесія, ресурс) — паралельно ([`async-parallel`](../vercel-react-best-practices/rules/async-parallel.md)).
4. **Запис** мінімального стану. Це єдине, на що користувач чекає.
5. **Повільне** — листи, вебхуки, аудит, аналітика — в `after()` з `next/server`
   ([`server-after-nonblocking`](../vercel-react-best-practices/rules/server-after-nonblocking.md)). Користувач не чекає побічних ефектів; до того ж Next.js виконує Server
   Actions одну за одною на клієнта, тож довга дія блокує наступну.
6. `revalidatePath(…)` для сторінок, що показують змінені дані.
7. **Повертаємо лише** `{ status: "ok" }` (за потреби `id`) — не рядок з бази, не об'єкт помилки
   ([`server-serialization`](../vercel-react-best-practices/rules/server-serialization.md)). Неочікувана помилка → `{ status: "error" }` і запис у журнал без даних форми.

**Форма (Client Component):**

```tsx
const [state, formAction, pending] = useActionState(addNote, { status: "idle" });
const err = state.status === "invalid" ? state.errors : {};
const values = state.status === "invalid" || state.status === "error" ? state.values : {};

<form action={formAction} noValidate>
  {state.status === "invalid" && (
    <p role="alert">Перевірте поля: {Object.keys(err).length} помилк(и).</p>
  )}
  <label htmlFor="note-text">Нотатка</label>
  <textarea id="note-text" name="text" maxLength={500} defaultValue={values.text}
    aria-invalid={err.text ? true : undefined}
    aria-describedby={err.text ? "note-text-error" : undefined} />
  {err.text && <p id="note-text-error">{err.text}</p>}
  <button type="submit" disabled={pending}>{pending ? "Зберігаємо…" : "Зберегти"}</button>
</form>
```

- `action={formAction}`, **не** `onSubmit` + `preventDefault`: інакше форма не працює без JS.
- Id запису (лід, проєкт) — прихованим полем `<input type="hidden" name="leadId" value={id} />`, **не**
  `useActionState(action.bind(null, id), …)`: у Next.js 16.3.5 зв'язана так дія без JavaScript не відповідає
  зовсім. Id з форми — недовірений ввід: у дії перевіряємо тип і належність (крок 3).
- `defaultValue` з `state.values` обов'язковий: після дії React 19 скидає некеровані поля, і без нього
  введене зникає навіть після помилки валідації. `values` повертаємо і в `{ status: "error", values }`
  (збій запису) — інакше текст зникає саме тоді, коли користувач нічого не зробив неправильно.
- Кожне поле: видимий `<label htmlFor>` + `id`; помилка — окремий елемент з `id`, пов'язаний через
  `aria-describedby`; `aria-invalid` лише на полях з помилкою; загальний підсумок — `role="alert"`.
- `noValidate` лише разом із серверною валідацією; атрибути `maxLength`/`required` лишаємо як підказку.

**Журнали:** пишемо подію, id запису, статус, тривалість. Ніколи — `formData`, `values`, ім'я, email,
телефон, текст повідомлення, IP. `console.error` у `catch` — з `error.name`, а не з об'єктом, що може
містити тіло запиту.

## Чекліст

```
- [ ] 1. Дія починається з перевірки сесії (або коментаря «public form: no session by design»).
- [ ] 2. Валідація — всередині дії, через чисту функцію parse…Form; довжина кожного поля обмежена.
- [ ] 3. Права на ресурс перевірено (запис належить workspace/користувачу з сесії).
- [ ] 4. Дія повертає лише { status, … } (+ errors/values при "invalid"), жодного рядка з бази.
- [ ] 5. Листи, вебхуки, аудит — в after(); у дії немає await на зовнішній сервіс.
- [ ] 6. useActionState + <form action={formAction}>; немає onSubmit з preventDefault і .bind() дії.
- [ ] 7. label/htmlFor, aria-invalid, aria-describedby, підсумок role="alert"; defaultValue зі state.values.
- [ ] 8. Жодного console.log/console.error з formData, values чи персональними даними.
```

## Правила зупинки — зупинись і спитай людину, якщо:

- Незрозуміло, хто має право надсилати форму (публічна чи лише для входу, яка роль).
- Форма приймає паролі, платіжні дані, документи чи файли понад 1 МБ (ліміт тіла Server Action).
- Для валідації хочеться нову залежність (`zod` тощо) — встановлення лише після «так» людини.
- Вимога записати в журнал чи передати в сторонній сервіс персональні дані.
- Результат побічного ефекту (вебхук, генерація документа) користувач має побачити у відповіді форми —
  це вже не `after()`, а окремий асинхронний сценарій зі статусом; узгодити підхід.

## Verify — задача готова, лише коли:

- [ ] `npm run lint` і `npm run build` без помилок.
- [ ] Порожня відправка: під полями — тексти помилок, у полів `aria-invalid="true"`, з'явився
      `role="alert"`; уведене в інших полях не зникло.
- [ ] Без JavaScript (DevTools → Command Menu → «Disable JavaScript»): форма надсилається, помилки й
      успіх показуються після перезавантаження сторінки.
- [ ] Дія без сесії: `POST` на сторінку з заголовком `Next-Action: <id>` (id — у
      `.next/server/server-reference-manifest.json`) без cookie → редирект на вхід або помилка; у журналі
      сервера немає запису в БД (`db:<мутація>` не зріс).
- [ ] Після відправки з тестовими даними журнал сервера не містить email, телефону чи тексту форми
      (`grep` по журналу `npm start`).
- [ ] DevTools → Network: `POST` дії повертається без очікування побічних ефектів (вебхуків, листів).
