import type { ReactNode } from 'react';

interface EditorSectionProps {
  title: string;
  children: ReactNode;
}

export function EditorSection({ title, children }: EditorSectionProps): JSX.Element {
  return (
    <section className="rounded-lg border border-[#79AE6F]/40 bg-[#F2EDC2]/25 p-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#346739]">{title}</h4>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

interface EditorInputProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  type?: 'text' | 'date' | 'email' | 'tel';
}

export function EditorInput({
  label,
  value,
  onChange,
  type = 'text',
}: EditorInputProps): JSX.Element {
  return (
    <label className="block text-xs text-slate-700">
      <span className="mb-1 block font-medium">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs outline-none ring-[#79AE6F] focus:ring"
      />
    </label>
  );
}

interface EditorNumberInputProps {
  label: string;
  value: number;
  onChange: (next: number) => void;
}

export function EditorNumberInput({ label, value, onChange }: EditorNumberInputProps): JSX.Element {
  return (
    <label className="block text-xs text-slate-700">
      <span className="mb-1 block font-medium">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs outline-none ring-[#79AE6F] focus:ring"
      />
    </label>
  );
}

interface EditorCheckboxProps {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

export function EditorCheckbox({ label, checked, onChange }: EditorCheckboxProps): JSX.Element {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 rounded border-slate-300 text-[#346739] focus:ring-[#79AE6F]"
      />
      <span>{label}</span>
    </label>
  );
}

interface EditorTextareaProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  rows?: number;
}

export function EditorTextarea({
  label,
  value,
  onChange,
  rows = 3,
}: EditorTextareaProps): JSX.Element {
  return (
    <label className="block text-xs text-slate-700">
      <span className="mb-1 block font-medium">{label}</span>
      <textarea
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y rounded-md border border-slate-300 px-2 py-1.5 text-xs outline-none ring-[#79AE6F] focus:ring"
      />
    </label>
  );
}
