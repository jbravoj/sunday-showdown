import { useState, type FormEvent } from "react";
import { api, errorMessage } from "./firebase.ts";
import { DISPLAY_NAME_MAX, validateDisplayName } from "../shared/invite.ts";

/**
 * "Edit name" link that opens a small form. Changes the player's own name;
 * their square stays the same.
 */
export default function EditName({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const check = validateDisplayName(value);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    if (check.name === name) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await api.renamePlayer({ displayName: check.name });
      setOpen(false);
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <p className="edit-name">
        <button
          className="link"
          type="button"
          onClick={() => {
            setValue(name);
            setError(null);
            setSaved(false);
            setOpen(true);
          }}
        >
          Edit name
        </button>
        {saved && <span className="edit-name-saved">Saved ✓</span>}
      </p>
    );
  }

  return (
    <form className="edit-name-form" onSubmit={onSave}>
      <label className="field">
        <span className="label">Name on your square</span>
        <input
          className="input"
          autoFocus
          maxLength={DISPLAY_NAME_MAX * 2}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <span className="hint">Up to {DISPLAY_NAME_MAX} characters. Your square number stays the same.</span>
      </label>
      <div className="edit-name-actions">
        <button className="btn btn-primary btn-small" disabled={busy} type="submit">
          {busy ? "Saving…" : "Save"}
        </button>
        <button className="btn btn-ghost btn-small" disabled={busy} type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
