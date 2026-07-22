import { Layout } from "../components/layouts";
import type { User } from "../services/users";

// The serialized config handed to the client Builder island. Kept in sync with
// BuilderConfig in src/client/components/builder.tsx.
export interface BuilderClientConfig {
  sets: { code: string; name: string | null; count: number }[];
  csrfToken: string;
  mode: "create" | "edit";
  slug?: string;
  initial?: {
    wants: { card: BuilderCard; quantity: number }[];
    haves: { card: BuilderCard; quantity: number }[];
    friendId: string;
    title: string;
  };
}

interface BuilderCard {
  id: string;
  name: string;
  set: string;
  number: number;
  rarity: string;
  ex: boolean;
}

interface BuilderPageProps {
  config: BuilderClientConfig;
  heading: string;
  sub: string;
  user: User | null;
  csrfToken?: string;
}

export const BuilderPage = ({
  config,
  heading,
  sub,
  user,
  csrfToken,
}: BuilderPageProps) => (
  <Layout
    title={
      config.mode === "edit"
        ? "Edit your list—wanthave"
        : "Build your trade list—wanthave"
    }
    description="Build a Pokémon TCG Pocket trade list and share it as a link."
    name="new"
    canonicalPath={config.mode === "edit" ? undefined : "/new"}
    noindex={config.mode === "edit"}
    user={user}
    csrfToken={csrfToken}
    chrome={false}
  >
    <section className="builder-intro">
      <h1 className="builder-heading">{heading}</h1>
      <p className="lead">{sub}</p>
    </section>
    <div id="builder-root" data-config={JSON.stringify(config)}>
      <noscript>
        <p className="builder-noscript">
          The trade-list builder needs JavaScript enabled to browse and pick
          cards. Please enable it and reload.
        </p>
      </noscript>
      <div className="builder-loading text-tertiary">
        Loading the card browser…
      </div>
    </div>
  </Layout>
);
