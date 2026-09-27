export const NOTE_MAX_LENGTH = 500;

export type NoteFormField = "text";

export type NoteFormData = {
  text: string;
};

export type NoteParseResult =
  | { ok: true; data: NoteFormData }
  | { ok: false; errors: Partial<Record<NoteFormField, string>>; values: Partial<NoteFormData> };

export function parseNoteForm(formData: FormData): NoteParseResult {
  const raw = formData.get("text");
  // Browsers submit textarea line breaks as CRLF but count them as one character
  // for maxLength, so normalize before checking the length.
  const text = typeof raw === "string" ? raw.replace(/\r\n?/g, "\n").trim() : "";

  const errors: Partial<Record<NoteFormField, string>> = {};

  if (!text) errors.text = "Напишіть текст нотатки";
  else if (text.length > NOTE_MAX_LENGTH) errors.text = `Не більше ${NOTE_MAX_LENGTH} символів`;

  return Object.keys(errors).length > 0
    ? { ok: false, errors, values: { text } }
    : { ok: true, data: { text } };
}
