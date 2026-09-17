"use client";

import { useId, useState } from "react";

export function PasswordInput({
  id,
  name,
  label,
  autoComplete,
  minLength,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete?: string;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  const toggleId = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium text-zinc-700">
          {label}
        </label>
        <button
          type="button"
          id={toggleId}
          onClick={() => setVisible((v) => !v)}
          className="text-xs font-medium text-zinc-500 hover:text-zinc-900"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        required
        minLength={minLength}
        autoComplete={autoComplete}
        className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
      />
    </div>
  );
}
