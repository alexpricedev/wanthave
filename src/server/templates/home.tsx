import { Layout } from "@server/components/layouts";
import { Wordmark } from "@server/components/wordmark";
import type { User } from "@server/services/users";

interface HomeProps {
  user: User | null;
  csrfToken?: string;
}

export const Home = ({ user, csrfToken }: HomeProps) => (
  <Layout
    title="WantHave"
    description="Build a Pokémon TCG Pocket trade list and share it as a link — it unfurls in Discord with an OG image showing what you're looking for."
    canonicalPath="/"
    name="home"
    user={user}
    csrfToken={csrfToken}
  >
    <section className="hero">
      <h1>
        <Wordmark />
      </h1>
      <p className="hero-sub">
        Build your Pokémon TCG Pocket trade list and share it as a link — no
        account needed. Post it in Discord and it unfurls with an OG image
        showing what you're looking for.
      </p>
    </section>
  </Layout>
);
