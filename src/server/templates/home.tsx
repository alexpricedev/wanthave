import { Layout } from "@server/components/layouts";
import { Wordmark } from "@server/components/wordmark";
import { faqStructuredData } from "@server/services/seo";
import type { User } from "@server/services/users";

interface HomeProps {
  user: User | null;
  csrfToken?: string;
}

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
      "Every tradeable card from the A1 set to the latest—diamonds (◆1–◆4), stars (★1–★2) and shiny (✵1–✵2). Immersive, Crown and promo cards can't be traded in Pokémon TCG Pocket, so they don't appear.",
  },
  {
    question: "What is slang search?",
    answer:
      "Type how the community talks. “RR chsr EX” finds the rainbow Charizard ex, “shiny pika” the shiny Pikachus, and “FA trainer” full-art trainers—plus abbreviations and small typos still resolve. You can also browse visually, set by set.",
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

// A few striking cards to stand in for a real unfurl in the hero preview and
// live-demo sections. Art is proxied same-origin via /img/card, same as
// everywhere else. Modelled on a real Discord trade post: chasing one rainbow
// ★2, with a row of rainbow (★2) and shiny (✵) cards up for trade — showing
// off the rarities slang search resolves. Counts in the badges match what's
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

const CountPill = () => (
  <span className="count-badge">
    <span className="count-want">LF {PREVIEW_WANTS.length}</span>
    <span className="count-sep">·</span>
    <span className="count-have">FT {PREVIEW_HAVES.length}</span>
  </span>
);

const CardRow = ({ ids }: { ids: string[] }) => (
  <div className="card-row">
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
);

export const Home = ({ user, csrfToken }: HomeProps) => (
  <Layout
    title="wanthave—share your Pokémon Pocket trade list"
    description="Build a Pokémon TCG Pocket trade list and share it as a link—it unfurls in Discord with an OG image showing what you're looking for."
    canonicalPath="/"
    name="home"
    user={user}
    csrfToken={csrfToken}
  >
    <section className="home-hero">
      <div className="home-rail" aria-hidden="true">
        <span className="vlabel vlabel-want">WANT</span>
        <span className="rail-divider" />
        <span className="vlabel vlabel-have">HAVE</span>
      </div>

      <div className="home-hero-copy">
        <p className="home-eyebrow">For Pokémon TCG Pocket traders</p>
        <h1 className="home-h1">
          The cards you <span className="want">want</span>,{" "}
          <br className="home-h1-break" />
          for the ones you <span className="have">have</span>.
        </h1>
        <p className="home-lead">
          Pick what you're looking for and what you'll trade. Post one link in
          any server—your cards show up right in the chat. No screenshots, no
          re-typing, no account.
        </p>
        <div className="home-hero-cta">
          <a className="btn-primary" href="/new">
            Build your list
          </a>
          <span className="home-cta-note">free · under 2 min</span>
        </div>
      </div>

      <div className="unfurl-mock" aria-hidden="true">
        <div className="unfurl-card">
          <div className="unfurl-row">
            <span className="vlabel vlabel-want unfurl-card-label">WANT</span>
            <CardRow ids={PREVIEW_WANTS} />
          </div>
          <div className="unfurl-row">
            <span className="vlabel vlabel-have unfurl-card-label">HAVE</span>
            <CardRow ids={PREVIEW_HAVES} />
          </div>
          <span className="unfurl-card-pill">
            <CountPill />
          </span>
          <span className="unfurl-card-mark">
            <Wordmark />
          </span>
        </div>
        <p className="unfurl-caption">
          this is what your link looks like when you post it
        </p>
      </div>
    </section>

    <section className="home-steps">
      <div className="home-step">
        <p className="home-step-eyebrow">01 · Pick</p>
        <h2>Two lists, tap to fill</h2>
        <p className="text-secondary">
          Search any card. One tap for <span className="want">want</span>, one
          for <span className="have">have</span>. Dupes counted automatically.
        </p>
      </div>
      <div className="home-step">
        <p className="home-step-eyebrow">02 · Link</p>
        <h2>Grab your URL</h2>
        <p className="text-secondary">
          One permanent link, always current. Edit your lists any time—the link
          never changes.
        </p>
        <code className="home-step-url">
          wanthave.trade/<span className="want">you</span>
        </code>
      </div>
      <div className="home-step">
        <p className="home-step-eyebrow">03 · Post</p>
        <h2>Trades come to you</h2>
        <p className="text-secondary">
          Drop it in any trading channel. Your wants show up front and
          center—matches DM you, not the other way round.
        </p>
      </div>
    </section>

    <section className="home-demo">
      <div className="home-demo-lists">
        <div className="preview-row">
          <span className="vlabel vlabel-want home-demo-label">WANT</span>
          <CardRow ids={PREVIEW_WANTS} />
        </div>
        <div className="preview-row">
          <span className="vlabel vlabel-have home-demo-label">HAVE</span>
          <CardRow ids={PREVIEW_HAVES} />
        </div>
      </div>
      <div className="home-demo-panel">
        <CountPill />
        <h2>A live page, not a screenshot</h2>
        <p className="text-secondary">
          Your page updates the second you edit. Old posts always point at your
          current lists.
        </p>
      </div>
    </section>

    <section className="home-final">
      <h2>
        Stop typing your list<span className="want">.</span>
      </h2>
      <a className="btn-primary" href="/new">
        Build your list
      </a>
      <span className="home-cta-note">
        free · no account · works in any server
      </span>
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

    {/* FAQPage structured data — eligible for rich results and read by AI
        answer engines. */}
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: static, server-generated JSON-LD
      dangerouslySetInnerHTML={{ __html: faqStructuredData(FAQ) }}
    />
  </Layout>
);
