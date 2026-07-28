import { Layout } from "../components/layouts";
import { FlywheelCta } from "../components/trade";
import type { User } from "../services/users";

interface Props {
  reason: "expired" | "missing";
  user: User | null;
  csrfToken?: string;
}

// Expired links never hard-404 — they resolve here with the flywheel CTA front
// and centre (see PRD "Anonymous lifecycle").
export const ListUnavailable = ({ reason, user, csrfToken }: Props) => {
  const expired = reason === "expired";
  return (
    <Layout
      title={
        expired
          ? "This trade list has expired—wanthave"
          : "Trade list not found—wanthave"
      }
      name="list"
      noindex
      user={user}
      csrfToken={csrfToken}
    >
      <section className="list-unavailable">
        <h1 className="unavailable-title">
          {expired ? "This list has expired" : "This list isn't here"}
        </h1>
        <p className="lead">
          {expired
            ? "Anonymous lists last 90 days. The good news: making a fresh one takes under two minutes—and with a free account your next one never expires and stays editable."
            : "This link doesn't point to a trade list. It may have been mistyped or removed."}
        </p>
        <FlywheelCta variant="primary" />
      </section>
    </Layout>
  );
};
