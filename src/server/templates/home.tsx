import { Layout } from "@server/components/layouts";
import { Wordmark } from "@server/components/wordmark";
import { faqStructuredData } from "@server/services/seo";
import type { User } from "@server/services/users";

interface HomeProps {
  user: User | null;
  csrfToken?: string;
}

const FEATURES: { title: string; body: string; hue: "want" | "have" }[] = [
  {
    title: "Speaks your slang",
    body: "Search the way the community talks — “RR chsr EX” finds the rainbow Charizard ex, “shiny pika” the shiny Pikachus. Misspellings and abbreviations still resolve.",
    hue: "want",
  },
  {
    title: "Grouped by rarity",
    body: "Pocket trades are same-rarity swaps, so your lists group by ◆, ★ and ✵ — viewers see exactly what they can trade against.",
    hue: "have",
  },
  {
    title: "Only tradeable cards",
    body: "Every set from A1 to the latest, filtered to the tradeable rarities: ◆1–◆4, ★1–★2 and shiny. Untradeable cards never show up.",
    hue: "want",
  },
  {
    title: "Built for your phone",
    body: "One-handed and fast, for when you're mid-Discord with the game open. Desktop is the adaptation, not the target.",
    hue: "have",
  },
  {
    title: "No account needed",
    body: "Go from landing to a shared link in under two minutes. Nothing to sign up for, nothing to install.",
    hue: "want",
  },
  {
    title: "Keep it forever",
    body: "Create a free account and your links never expire — edit a list in place and its Discord unfurl updates too.",
    hue: "have",
  },
];

const FAQ: { question: string; answer: string }[] = [
  {
    question: "Do I need an account?",
    answer:
      "No. You can build a trade list and share it anonymously in under two minutes. Create a free account only if you want your link to last forever and stay editable.",
  },
  {
    question: "How does the Discord unfurl work?",
    answer:
      "When you paste your link, Discord shows an image of the cards you're looking for along with your want/have counts, so people know what you're after before they even click.",
  },
  {
    question: "Which cards can I add?",
    answer:
      "Every tradeable card from the A1 set to the latest — diamonds (◆1–◆4), stars (★1–★2) and shiny (✵1–✵2). Immersive, Crown and promo cards can't be traded in Pokémon TCG Pocket, so they don't appear.",
  },
  {
    question: "What is slang search?",
    answer:
      "Type how the community talks. “RR chsr EX” finds the rainbow Charizard ex, “shiny pika” the shiny Pikachus, and “FA trainer” full-art trainers — plus abbreviations and small typos still resolve. You can also browse visually, set by set.",
  },
  {
    question: "How long does my link last?",
    answer:
      "Anonymous links last 90 days. With a free account they never expire, and you can edit a list in place so a pinned Discord post always stays current.",
  },
  {
    question: "Is it free?",
    answer: "Yes, completely. There's no paywall on cards, links, or accounts.",
  },
];

// A few striking cards to stand in for a real unfurl in the hero preview. Art is
// proxied same-origin via /img/card, same as everywhere else.
// A faithful example modelled on a real Discord trade post: chasing one rainbow
// ★2, with a row of rainbow (★2) and shiny (✵) cards up for trade — showing off
// the rarities slang search resolves. Counts in the badge below match what's
// shown.
const PREVIEW_WANTS = ["a1-253"]; // ★2 Charizard ex (rainbow)
const PREVIEW_HAVES = [
  "b1-321", // ✵2 Pikachu ex (shiny)
  "a1-262", // ★2 Mewtwo ex (rainbow)
  "b1-328", // ✵2 Arceus ex (shiny)
  "a1a-076", // ★2 Gyarados ex (rainbow)
  "a3a-100", // ✵2 Arcanine ex (shiny)
  "b2-185", // ★2 Mega Gardevoir ex (rainbow)
];

const PreviewRow = ({
  ids,
  kind,
}: {
  ids: string[];
  kind: "want" | "have";
}) => (
  <div className={`preview-row preview-${kind}`}>
    <span className={`preview-vlabel ${kind === "want" ? "want" : "have"}`}>
      {kind === "want" ? "WANT" : "HAVE"}
    </span>
    <div className="preview-cards">
      {ids.map((id) => (
        <img
          key={id}
          src={`/img/card/${id}`}
          alt=""
          width={183}
          height={256}
          loading="lazy"
        />
      ))}
    </div>
  </div>
);

export const Home = ({ user, csrfToken }: HomeProps) => (
  <Layout
    title="wanthave — share your Pokémon Pocket trade list"
    description="Build a Pokémon TCG Pocket trade list and share it as a link — it unfurls in Discord with an OG image showing what you're looking for."
    canonicalPath="/"
    name="home"
    user={user}
    csrfToken={csrfToken}
  >
    <section className="hero">
      <p className="hero-eyebrow">Pokémon TCG Pocket</p>
      <h1 className="hero-title">
        Drop your <Wordmark />
      </h1>
      <p className="hero-sub">
        Build your trade list once and share one link. Post it in Discord and it
        unfurls with the cards you're <span className="want">looking for</span>{" "}
        — no re-typing, no screenshots, no account needed.
      </p>
      <div className="hero-cta">
        <a className="btn-primary" href="/new">
          Build your trade list
        </a>
        <span className="hero-cta-note">Free · under 2 minutes</span>
      </div>

      <div className="hero-preview" aria-hidden="true">
        <PreviewRow ids={PREVIEW_WANTS} kind="want" />
        <PreviewRow ids={PREVIEW_HAVES} kind="have" />
        <span className="preview-mark">
          <span className="count-badge">
            <span className="count-want">LF {PREVIEW_WANTS.length}</span>
            <span className="count-sep">·</span>
            <span className="count-have">FT {PREVIEW_HAVES.length}</span>
          </span>
        </span>
      </div>
    </section>

    <section className="steps">
      <h2 className="steps-title">One link does it all</h2>
      <ol className="steps-grid">
        <li className="step">
          <span className="step-num">1</span>
          <h3>Pick your cards</h3>
          <p className="text-secondary">
            Browse by set or search community slang — “RR chsr EX” finds the
            Charizard you mean. Only tradeable rarities show up.
          </p>
        </li>
        <li className="step">
          <span className="step-num">2</span>
          <h3>Add your friend ID</h3>
          <p className="text-secondary">
            Enter your 16-digit code once. Viewers copy it with one tap and add
            you in-game.
          </p>
        </li>
        <li className="step">
          <span className="step-num">3</span>
          <h3>Share the link</h3>
          <p className="text-secondary">
            Post it anywhere. In Discord it unfurls with an image of your chase
            cards, so people know what you want before they click.
          </p>
        </li>
      </ol>
    </section>

    <section className="features">
      <h2 className="features-title">Everything a trade post needs</h2>
      <div className="features-grid">
        {FEATURES.map((f) => (
          <div key={f.title} className="feature">
            <span className={`feature-mark ${f.hue}`} aria-hidden="true" />
            <h3>{f.title}</h3>
            <p className="text-secondary">{f.body}</p>
          </div>
        ))}
      </div>
    </section>

    <section className="faq">
      <h2 className="faq-title">Questions</h2>
      <div className="faq-list">
        {FAQ.map((item) => (
          <details key={item.question} className="faq-item">
            <summary className="faq-q">{item.question}</summary>
            <p className="faq-a text-secondary">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>

    <section className="home-cta">
      <h2>Ready to trade?</h2>
      <p className="lead">
        Build your <span className="want">want</span>
        <span className="have">have</span> and drop the link in your server.
      </p>
      <a className="btn-primary" href="/new">
        Build your trade list
      </a>
    </section>

    {/* FAQPage structured data — eligible for rich results and read by AI
        answer engines. */}
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: static, server-generated JSON-LD
      dangerouslySetInnerHTML={{ __html: faqStructuredData(FAQ) }}
    />
  </Layout>
);
