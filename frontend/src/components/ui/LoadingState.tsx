interface LoadingStateProps {
  label?: string;
}

export default function LoadingState({ label = 'Loading data...' }: LoadingStateProps): JSX.Element {
  return (
    <div className="grid min-h-70 place-items-center rounded-2xl border border-slate-200 bg-white p-8 text-slate-600">
      <div className="flex items-center gap-3">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-primary-600" />
        <span className="text-sm font-medium">{label}</span>
      </div>
    </div>
  );
}
