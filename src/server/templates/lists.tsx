import { CsrfField } from "../components/csrf-field";
import { Layout } from "../components/layouts";
import { CountBadge } from "../components/trade";
import type { ListSummary } from "../services/lists";
import type { User } from "../services/users";

interface ListsProps {
  lists: ListSummary[];
  user: User;
  logoutCsrf?: string;
  deleteCsrfTokens: Record<string, string>;
}

const fmtDate = (d: Date): string =>
  d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

export const Lists = ({
  lists,
  user,
  logoutCsrf,
  deleteCsrfTokens,
}: ListsProps) => (
  <Layout
    title="Your lists — wanthave"
    name="lists"
    noindex
    user={user}
    csrfToken={logoutCsrf}
  >
    <section className="lists-page">
      <header className="lists-head">
        <h1>Your lists</h1>
        <a className="btn-primary" href="/new">
          New list
        </a>
      </header>

      {lists.length === 0 ? (
        <div className="lists-empty">
          <p className="lead">
            You haven't saved any lists yet. Account lists never expire and can
            be edited in place — the link and its Discord unfurl stay current.
          </p>
          <a className="btn-primary" href="/new">
            Build your first list
          </a>
        </div>
      ) : (
        <ul className="lists-grid">
          {lists.map((l) => (
            <li key={l.slug} className="list-row">
              <div className="list-row-main">
                <a className="list-row-title" href={`/l/${l.slug}`}>
                  {l.title ?? "Untitled list"}
                </a>
                <div className="list-row-meta">
                  <CountBadge wantCount={l.wantCount} haveCount={l.haveCount} />
                  <span className="list-row-date text-tertiary">
                    {fmtDate(l.createdAt)} · never expires
                  </span>
                </div>
              </div>
              <div className="list-row-actions">
                <a className="btn-ghost" href={`/l/${l.slug}`}>
                  View
                </a>
                <a className="btn-ghost" href={`/lists/${l.slug}/edit`}>
                  Edit
                </a>
                <form method="post" action={`/lists/${l.slug}/delete`}>
                  <CsrfField token={deleteCsrfTokens[l.slug] ?? null} />
                  <button type="submit" className="btn-danger">
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  </Layout>
);
