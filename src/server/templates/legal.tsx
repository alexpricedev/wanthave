import { Layout } from "@server/components/layouts";
import type { User } from "@server/services/users";

interface LegalProps {
  user: User | null;
  csrfToken?: string;
}

// Shared shell for the two static legal pages. Content is plain prose wrapped in
// a narrow, readable column; styling lives in pages/legal.css keyed off
// <body data-page="legal">.
const LegalPage = ({
  title,
  name,
  path,
  user,
  csrfToken,
  updated,
  children,
}: LegalProps & {
  title: string;
  name: string;
  path: string;
  updated: string;
  children: React.ReactNode;
}) => (
  <Layout
    title={`${title}—wanthave`}
    description={`${title} for wanthave.`}
    canonicalPath={path}
    name={name}
    user={user}
    csrfToken={csrfToken}
  >
    <article className="legal">
      <h1>{title}</h1>
      <p className="legal-updated">Last updated {updated}</p>
      {children}
    </article>
  </Layout>
);

export const Privacy = ({ user, csrfToken }: LegalProps) => (
  <LegalPage
    title="Privacy Policy"
    name="legal"
    path="/privacy"
    updated="23 July 2026"
    user={user}
    csrfToken={csrfToken}
  >
    <p>
      wanthave lets you build and share Pokémon TCG Pocket trade lists. This
      policy explains what we collect and why. We keep it minimal on purpose.
    </p>

    <h2>What we collect</h2>
    <ul>
      <li>
        <strong>Trade lists.</strong> The cards you add to a list and its
        want/have counts. Anonymous lists are stored against a random slug with
        no account attached.
      </li>
      <li>
        <strong>Account details.</strong> If you create an account, we store
        your email address so you can sign in with a magic link and keep your
        lists editable.
      </li>
      <li>
        <strong>Basic technical data.</strong> Standard request logs (such as IP
        address and user agent) needed to run the service and protect it from
        abuse.
      </li>
    </ul>

    <h2>What we don't do</h2>
    <ul>
      <li>We don't sell your data.</li>
      <li>We don't run third-party advertising trackers.</li>
      <li>We don't ask for more than we need to run the service.</li>
    </ul>

    <h2>How long we keep it</h2>
    <p>
      Anonymous links expire after 90 days and their data is removed. Lists tied
      to an account are kept until you delete them or ask us to close your
      account.
    </p>

    <h2>Your choices</h2>
    <p>
      You can edit or delete your lists at any time. To delete your account or
      request a copy of your data, email us and we'll take care of it.
    </p>

    <h2>Contact</h2>
    <p>
      Questions about this policy? Reach out to the team at{" "}
      <a href="mailto:ops@chptrs.tech">CHPTRS</a>.
    </p>
  </LegalPage>
);

export const Terms = ({ user, csrfToken }: LegalProps) => (
  <LegalPage
    title="Terms &amp; Conditions"
    name="legal"
    path="/terms"
    updated="23 July 2026"
    user={user}
    csrfToken={csrfToken}
  >
    <p>
      By using wanthave you agree to these terms. If you don't agree, please
      don't use the service.
    </p>

    <h2>Using the service</h2>
    <p>
      wanthave is a free tool for building and sharing Pokémon TCG Pocket trade
      lists. You may use it for personal, non-commercial trading. Don't use it
      to break the law, infringe anyone's rights, or disrupt the service for
      others.
    </p>

    <h2>Your content</h2>
    <p>
      You're responsible for the lists you create and share. Don't upload or
      link to anything unlawful, abusive, or that isn't yours to share. We may
      remove content or lists that violate these terms.
    </p>

    <h2>Accounts</h2>
    <p>
      Keep access to the email you sign in with. You're responsible for activity
      on your account. Anonymous links expire after 90 days; accounts keep your
      lists until you delete them.
    </p>

    <h2>Availability</h2>
    <p>
      The service is provided "as is" and "as available", without warranties of
      any kind. We may change, suspend, or discontinue any part of it at any
      time. To the extent permitted by law, we aren't liable for any damages
      arising from your use of the service.
    </p>

    <h2>Trademarks</h2>
    <p>
      Pokémon and Pokémon TCG Pocket are trademarks of their respective owners.
      wanthave is an independent, unofficial tool and is not affiliated with,
      endorsed by, or sponsored by them.
    </p>

    <h2>Changes</h2>
    <p>
      We may update these terms from time to time. Continued use after a change
      means you accept the updated terms.
    </p>

    <h2>Contact</h2>
    <p>
      Questions? Reach the team at <a href="mailto:ops@chptrs.tech">CHPTRS</a>.
    </p>
  </LegalPage>
);
