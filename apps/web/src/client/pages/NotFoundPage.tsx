import { Link } from 'react-router';

// Placeholder until i18n (#34): shows only the status code and a link home.
export function NotFoundPage() {
  return (
    <main className="shell">
      <p className="status" data-testid="not-found">
        404
      </p>
      <Link className="home-link" to="/">
        RowLens
      </Link>
    </main>
  );
}
