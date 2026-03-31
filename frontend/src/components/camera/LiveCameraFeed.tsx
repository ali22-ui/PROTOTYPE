interface LiveCameraFeedProps {
  streamUrl: string;
  fallbackVideoUrl?: string;
  cameraName: string;
  status: string;
}

export default function LiveCameraFeed({
  streamUrl,
  fallbackVideoUrl,
  cameraName,
  status,
}: LiveCameraFeedProps): JSX.Element {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-700">{cameraName}</h3>
        <span
          className={[
            'rounded-full px-2.5 py-1 text-xs font-semibold',
            status.toUpperCase() === 'RUNNING'
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-amber-100 text-amber-700',
          ].join(' ')}
        >
          {status}
        </span>
      </header>

      <div className="relative aspect-video w-full bg-slate-900">
        <img
          src={streamUrl}
          alt="Live camera feed"
          className="h-full w-full object-cover"
          onError={(event) => {
            const image = event.currentTarget;
            image.style.display = 'none';
          }}
        />

        {fallbackVideoUrl ? (
          <video
            src={fallbackVideoUrl}
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 h-full w-full object-cover opacity-85"
          />
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/65 to-transparent p-3 text-xs text-white">
          Stream wrapper is ready for MJPEG/WebRTC source integration from
          backend.
        </div>
      </div>
    </section>
  );
}
