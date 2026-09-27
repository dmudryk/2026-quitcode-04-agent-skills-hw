"use client";

import { useActionState } from "react";
import { addLeadNote, type AddLeadNoteState } from "@/app/actions";
import { NOTE_MAX_LENGTH } from "@/lib/note-form";

const initialState: AddLeadNoteState = { status: "idle" };

export function NoteForm({ leadId }: { leadId: string }) {
  const [state, formAction, pending] = useActionState(addLeadNote, initialState);
  const errors = state.status === "invalid" ? state.errors : {};
  // Restore the typed text after a validation error and after a failed save alike.
  const values = state.status === "invalid" || state.status === "error" ? state.values : {};

  return (
    <form action={formAction} className="space-y-2" noValidate>
      <input type="hidden" name="leadId" value={leadId} />
      {state.status === "invalid" && (
        <p role="alert" className="text-red-700">
          Нотатку не збережено: виправте поле нижче.
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="text-red-700">
          Не вдалося зберегти нотатку. Оновіть сторінку й спробуйте ще раз.
        </p>
      )}

      <label htmlFor="note-text" className="block font-medium">
        Додати нотатку
      </label>
      <textarea
        id="note-text"
        name="text"
        rows={3}
        required
        maxLength={NOTE_MAX_LENGTH}
        defaultValue={values.text}
        aria-invalid={errors.text ? true : undefined}
        aria-describedby={errors.text ? "note-text-hint note-text-error" : "note-text-hint"}
        className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <p id="note-text-hint" className="text-xs text-slate-500">
        До {NOTE_MAX_LENGTH} символів. Нотатка додається в кінець внутрішніх нотаток.
      </p>
      {errors.text && (
        <p id="note-text-error" className="text-xs text-red-600">
          {errors.text}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {pending ? "Зберігаємо…" : "Зберегти нотатку"}
        </button>
        <p role="status" className="text-slate-600">
          {state.status === "ok" ? "Нотатку додано." : ""}
        </p>
      </div>
    </form>
  );
}
