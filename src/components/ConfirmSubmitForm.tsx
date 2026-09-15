"use client";

export function ConfirmSubmitForm({
  action,
  confirmMessage,
  label,
  className,
}: {
  action: () => Promise<void>;
  confirmMessage: string;
  label: string;
  className?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}
