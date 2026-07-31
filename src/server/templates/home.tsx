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
      "No. You can build a trade list and share it anonymously in under two minutes. An anonymous list is fixed once it's made—create a free account if you want to edit it as you trade and keep the link from expiring.",
  },
  {
    question: "How does it work?",
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
      "Anonymous links last 90 days and can't be changed after you create them. With a free account they never expire and you can edit a list in place—the URL stays the same, so a pinned Discord post always stays current.",
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
// shown. Drawn from the newest set so the page shows what people are actually
// hunting right now — refresh these when a set drops.
const PREVIEW_WANTS = ["b4-188"]; // ★2 Mega Rayquaza ex (rainbow)
const PREVIEW_HAVES = [
  "b4-227", // ✵2 Mega Gardevoir ex (shiny)
  "b4-187", // ★2 Mega Metagross ex (rainbow)
  "b4-231", // ✵2 Mega Kangaskhan ex (shiny)
  "b4-185", // ★2 Mega Gallade ex (rainbow)
  "b4-226", // ✵2 Mega Swampert ex (shiny)
  "b4-182", // ★2 Mega Sharpedo ex (rainbow)
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
          Pick what you're looking for and what you have for trade. Post one
          link in any server and your cards show up right in the chat.
        </p>
        <div className="home-hero-cta">
          <a className="btn-primary" href="/new">
            Build your list
          </a>
          {!user && (
            <a className="btn-ghost" href="/login">
              Log in
            </a>
          )}
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
        <p className="home-step-eyebrow">Step 1</p>
        <h2>Build your lists</h2>
        <p className="text-secondary">
          Search any card. One tap for <span className="want">want</span>, one
          for <span className="have">have</span>. You can show dupe cards too.
        </p>
      </div>
      <div className="home-step">
        <p className="home-step-eyebrow">Step 2</p>
        <h2>Share your unique URL</h2>
        <p className="text-secondary">
          One link, and with a free account you can edit it as you trade. The
          page even shows your Friend ID.
        </p>
        <code className="home-step-url">
          wanthave.trade/l/<span className="want">list-id</span>
        </code>
      </div>
      <div className="home-step">
        <p className="home-step-eyebrow">Step 3</p>
        <h2>Organise your trade</h2>
        <p className="text-secondary">
          Drop it in any trading channel. Your wants show up front and center.
          Organise the trade as you normally do.
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
      </div>
    </section>

    <section className="home-final">
      <h2>
        Stop typing your list<span className="want">.</span>
      </h2>
      <a className="btn-primary" href="/new">
        Create your trade page
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
