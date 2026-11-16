import { helpStrings } from './strings.ts';
import { Examples } from './Examples.tsx';
import { UNIFIED_USERS } from '../features.ts';
export function HelpPage() {
  const t = helpStrings();
  return (
    <main className="page help-page">
      <h1>{t.help}</h1>
      <p>{t.guideIntro}</p>
      <nav aria-label={t.help}>
        <ul>
          {t.sections.map(([id, title]) => (
            <li key={id}>
              <a href={`#${id}`}>{title}</a>
            </li>
          ))}
        </ul>
      </nav>
      {UNIFIED_USERS && <Examples manage />}
      {t.sections.map(([id, title, body]) => (
        <section className="card" id={id} key={id}>
          <h2>{title}</h2>
          <p>{body}</p>
        </section>
      ))}
    </main>
  );
}
