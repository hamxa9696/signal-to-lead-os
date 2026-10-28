// Same header on every page: small mono label, big title, one-line description, actions on the right.
export function PageHeader({ eyebrow, title, description, actions, titleLang }: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  titleLang?: string;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 lang={titleLang} className="page-title">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
