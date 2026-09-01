import { Layout } from "../components/layouts";
import { NamePrompt } from "../components/name-prompt";
import {
  CountBadge,
  FlywheelCta,
  FriendIdBlock,
  RaritySection,
} from "../components/trade";
import type { TradeList } from "../services/lists";
import type { User } from "../services/users";

interface ListProps {
  list: TradeList;
  shareUrl: string;
  created: boolean;
  canClaim: boolean;
  // This visitor built the list but has no account yet — see isDeviceClaimant.
  builtHere: boolean;
  isOwner: boolean;
  user: User | null;
  csrfToken?: string;
  // CSRF for the inline "add your name" form. Only minted for the owner, who
  // is the only visitor that form is rendered for.
  accountCsrf?: string;
}

// Collapsed preview of the Discord/Twitter unfurl. A native <details> — no
// client JS, and the closed panel keeps the image out of the layout until it's
// asked for. The src must carry the same ?v= token as the meta tag: those URLs
// are cached immutably, so the bare path would show the pre-edit image back.
const OgPreview = ({ src }: { src: string }) => (
  <details className="og-preview">
    <summary className="og-preview-toggle">Preview</summary>
    <img
      className="og-preview-img"
      src={src}
      alt="How this list looks when the link is shared"
      width={1200}
      height={630}
      loading="lazy"
    />
  </details>
);

export const ListPage = ({
  list,
  shareUrl,
  created,
  canClaim,
  builtHere,
  isOwner,
  user,
  csrfToken,
  accountCsrf,
}: ListProps) => {
  const wantCount = list.wants.length;
  const haveCount = list.haves.length;

  // The title reads as a sentence in a Discord embed, so the parts are joined
  // with words rather than dashes.
  const by = list.ownerName ? ` by ${list.ownerName}` : "";
  const title = `${list.title ?? "Pokémon Pocket trade list"}${by} on wanthave`;
  const cardsWanted = `${wantCount} card${wantCount === 1 ? "" : "s"}`;
  const cardsHeld = `${haveCount} card${haveCount === 1 ? "" : "s"}`;
  // An empty side reads as a negative in a share preview ("with 0 up for
  // trade"), so a zero count drops out of the sentence entirely.
  const who = list.ownerName ?? "";
  const summary =
    wantCount > 0 && haveCount > 0
      ? who
        ? `${who} is looking for ${cardsWanted}, with ${haveCount} up for trade.`
        : `Looking for ${cardsWanted}, ${haveCount} up for trade.`
      : wantCount > 0
        ? who
          ? `${who} is looking for ${cardsWanted}.`
          : `Looking for ${cardsWanted}.`
        : haveCount > 0
          ? who
            ? `${who} has ${cardsHeld} up for trade.`
            : `${cardsHeld} up for trade.`
          : who
            ? `${who}'s Pokémon Pocket trade list.`
            : "A Pokémon Pocket trade list.";
  const description = `${summary} Built with wanthave.trade.`;
  const headTitle =
    list.title ??
    (list.ownerName
      ? `${list.ownerName}'s trade list`
      : "Pokémon Pocket trade list");

  // The share moment is when a name is worth the most, so that's where it's
  // asked for. Returning to this same URL keeps the panel they were reading.
  const nameReturnTo = created
    ? `/l/${list.slug}?created=1`
    : `/l/${list.slug}`;
  const askForName = isOwner && !list.ownerName;

  // Version the OG image URL on updated_at. Discord's media proxy caches by URL
  // and never revalidates, so an edited list needs a brand new image URL for the
  // unfurl to pick up the new cards.
  const ogImagePath = `/l/${list.slug}/og.png?v=${list.updatedAt.getTime()}`;

  return (
    <Layout
      title={title}
      description={description}
      name="list"
      canonicalPath={`/l/${list.slug}`}
      ogImagePath={ogImagePath}
      user={user}
      csrfToken={csrfToken}
    >
      <article className="list-page" data-page-list>
        {created ? (
          <section
            className="share-panel"
            data-share
            aria-label="Your link is ready"
          >
            <div className="share-head">
              <h1 className="share-title">Your link is ready</h1>
            </div>
            <p className="share-sub">
              Paste this link into Discord and it'll show a preview of your
              list.
            </p>
            <div className="share-url-row">
              <input
                className="share-url"
                type="text"
                readOnly
                value={shareUrl}
                aria-label="Shareable link"
                data-share-url
              />
              <button
                type="button"
                className="share-copy"
                data-copy
                data-copy-text={shareUrl}
              >
                Copy link
              </button>
            </div>
            <OgPreview src={ogImagePath} />
            {askForName ? (
              <NamePrompt
                csrfToken={accountCsrf}
                returnTo={nameReturnTo}
                idPrefix="share"
              />
            ) : null}
            {canClaim ? (
              <div className="nudge" data-nudge>
                <p className="nudge-copy">
                  BTW: this unique link is locked, and will expire in 90 days.
                  You can create a free account which will link this list to
                  your email and allow you to update it as trades come in.
                </p>
                <div className="nudge-actions">
                  <a className="btn-primary nudge-btn" href="/signup">
                    Claim account
                  </a>
                  <button
                    type="button"
                    className="nudge-dismiss"
                    data-nudge-dismiss
                  >
                    Not now
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        ) : (
          <header className="list-head">
            {list.ownerName && list.title ? (
              <p className="list-head-owner text-tertiary">
                {`Shared by ${list.ownerName}`}
              </p>
            ) : null}
            <h1 className="list-head-title">{headTitle}</h1>
            <p className="list-head-hint">
              {isOwner || builtHere
                ? "This page has the cards you're looking for and the cards you have up for trade."
                : list.ownerName
                  ? `These are the cards ${list.ownerName} is looking for, and the ones they have up for trade.`
                  : "This page has a list of cards your buddy is looking for and a list of the cards he has to trade."}
            </p>
            <CountBadge wantCount={wantCount} haveCount={haveCount} />
          </header>
        )}

        {/* Returning to a list you made as a guest. The share panel above
            already makes the pitch on the ?created=1 pass. */}
        {builtHere && !created ? (
          <div className="claim-bar">
            <div className="claim-bar-copy">
              <span className="owner-note text-tertiary">
                You made this list
              </span>
              <p className="nudge-copy">
                It expires in 90 days and can't be changed. Creating an account
                now will link it with your email address and allow you to edit
                the cards as you trade.
              </p>
            </div>
            <a className="btn-primary nudge-btn" href="/signup">
              Claim &amp; edit
            </a>
          </div>
        ) : null}

        {isOwner ? (
          <div className="owner-bar">
            <div className="owner-bar-head">
              <span className="owner-note text-tertiary">
                You own this list
              </span>
              <a className="btn-ghost" href={`/lists/${list.slug}/edit`}>
                Edit list
              </a>
            </div>
            {/* The share panel above already shows the link on ?created=1, so
                only the plain owner view repeats it here. */}
            {!created ? (
              <div className="share-url-row">
                <input
                  className="share-url"
                  type="text"
                  readOnly
                  value={shareUrl}
                  aria-label="Shareable link"
                />
                <button
                  type="button"
                  className="share-copy"
                  data-copy
                  data-copy-text={shareUrl}
                >
                  Copy link
                </button>
              </div>
            ) : null}
            {!created ? <OgPreview src={ogImagePath} /> : null}
            {askForName && !created ? (
              <NamePrompt
                csrfToken={accountCsrf}
                returnTo={nameReturnTo}
                idPrefix="owner"
              />
            ) : null}
            {list.ownerName ? (
              <p className="owner-name-note text-tertiary">
                Shared as <strong>{list.ownerName}</strong> ·{" "}
                <a href="/account">Change name</a>
              </p>
            ) : null}
          </div>
        ) : null}

        {wantCount > 0 ? (
          <RaritySection kind="want" cards={list.wants} />
        ) : null}
        {haveCount > 0 ? (
          <RaritySection kind="have" cards={list.haves} />
        ) : null}

        {list.friendId ? <FriendIdBlock friendId={list.friendId} /> : null}

        {/* "Build your own list" is for visitors — the person who built this
            one is being asked to claim it instead. */}
        {!created && !builtHere ? <FlywheelCta variant="quiet" /> : null}
      </article>
    </Layout>
  );
};
