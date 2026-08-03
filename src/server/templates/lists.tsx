import { CsrfField } from "../components/csrf-field";
import { Layout } from "../components/layouts";
import { NamePrompt } from "../components/name-prompt";
import { CountBadge } from "../components/trade";
import type { ListSummary } from "../services/lists";
import type { User } from "../services/users";

interface ListsProps {
  lists: ListSummary[];
  user: User;
  logoutCsrf?: string;
  deleteCsrfTokens: Record<string, string>;
  // Only minted when the user hasn't named themselves yet — see the prompt.
  accountCsrf?: string;
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
  accountCsrf,
}: ListsProps) => (
  <Layout
    title="Your lists—wanthave"
    name="lists"
    noindex
    user={user}
    csrfToken={logoutCsrf}
  >
    <section className="lists-page">
      <header className="lists-head">
        <h1>Your lists</h1>
        {lists.length > 0 && (
          <a className="btn-primary" href="/new">
            New list
          </a>
        )}
      </header>

      {/* The landing page after signing in or claiming lists — and the last
          quiet moment to put a name on links that are already out there. */}
      {user.display_name ? null : (
        <NamePrompt
          csrfToken={accountCsrf}
          returnTo="/lists"
          idPrefix="lists"
          label="Add your name to your shared links"
        />
      )}

      {lists.length === 0 ? (
        <div className="lists-empty">
          <p className="lead">
            You haven't saved any lists yet. Account lists never expire and can
            be edited in place.
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
                <form
                  method="post"
                  action={`/lists/${l.slug}/delete`}
                  data-confirm={`Deleting “${l.title ?? "Untitled list"}” is permanent, and its link will stop working for anyone you've shared it with.`}
                  data-confirm-title="Delete this list?"
                  data-confirm-label="Delete list"
                >
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
