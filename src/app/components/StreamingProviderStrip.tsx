import '../../styles/streaming-provider-strip.css';

const PROVIDERS = [
  { name: 'Netflix', mark: 'N', className: 'is-netflix' },
  { name: 'Prime Video', mark: 'prime', className: 'is-prime' },
  { name: 'Disney+', mark: 'Disney+', className: 'is-disney' },
  { name: 'Hulu', mark: 'hulu', className: 'is-hulu' },
  { name: 'Max', mark: 'max', className: 'is-max' },
];

function ProviderItems({ hidden = false }: { hidden?: boolean }) {
  return (
    <div className="provider-strip__group" aria-hidden={hidden || undefined}>
      {PROVIDERS.map((provider) => (
        <div className={'provider-strip__provider ' + provider.className} key={provider.name}>
          <span className="provider-strip__mark" aria-hidden>{provider.mark}</span>
          <span className="provider-strip__name">{provider.name}</span>
        </div>
      ))}
    </div>
  );
}

export function StreamingProviderStrip({
  mode = 'static',
  heading = 'Supported where you already stream',
}: {
  mode?: 'static' | 'marquee';
  heading?: string;
}) {
  const headingId = 'provider-strip-' + mode;
  return (
    <section className={'provider-strip provider-strip--' + mode} aria-labelledby={headingId}>
      <div className="provider-strip__intro">
        <p>SUPPORTED SERVICES</p>
        <h2 id={headingId}>{heading}</h2>
        <span>Chrome on desktop. Availability and title matching can vary by service and region.</span>
      </div>
      <div className="provider-strip__viewport">
        <div className="provider-strip__track">
          <ProviderItems />
          {mode === 'marquee' && <ProviderItems hidden />}
        </div>
      </div>
      <p className="provider-strip__boundary">
        Streaming Helper works alongside these services and is not affiliated with or connected to their accounts.
      </p>
    </section>
  );
}