import { Layout } from "../components/layouts";
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
  isOwner: boolean;
  user: User | null;
  csrfToken?: string;
}

export const ListPage = ({
  list,
  shareUrl,
  created,
  canClaim,
  isOwner,
  user,
  csrfToken,
}: ListProps) => {
  const wantCount = list.wants.length;
  const haveCount = list.haves.length;
  const title = list.title
    ? `${list.title}—wanthave`
    : `Pokémon Pocket trade list—LF ${wantCount} · FT ${haveCount}`;
  const description = `Looking for ${wantCount} card${wantCount === 1 ? "" : "s"}, ${haveCount} up for trade. Built with wanthave.trade.`;

  return (
    <Layout
      title={title}
      description={description}
      name="list"
      canonicalPath={`/l/${list.slug}`}
      ogImagePath={`/l/${list.slug}/og.png`}
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
              Paste this link into Discord and it'll show a previous of your
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
            {canClaim ? (
              <div className="nudge" data-nudge>
                <p className="nudge-copy">
                  BTW: This link expires in 90 days. Create a free account to
                  keep it forever and edit it anytime.
                </p>
                <div className="nudge-actions">
                  <a className="btn-primary nudge-btn" href="/login">
                    Keep it forever
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
            <h1 className="list-head-title">
              {list.title ?? "Pokémon Pocket trade list"}
            </h1>
            <p className="list-head-hint">
              This page has a list of cards your buddy is looking for and a list
              of the cards he has to trade.
            </p>
            <CountBadge wantCount={wantCount} haveCount={haveCount} />
          </header>
        )}

        {isOwner ? (
          <div className="owner-bar">
            <span className="owner-note text-tertiary">You own this list</span>
            <a className="btn-ghost" href={`/lists/${list.slug}/edit`}>
              Edit list
            </a>
          </div>
        ) : null}

        {wantCount > 0 ? (
          <RaritySection kind="want" cards={list.wants} />
        ) : null}
        {haveCount > 0 ? (
          <RaritySection kind="have" cards={list.haves} />
        ) : null}

        {list.friendId ? <FriendIdBlock friendId={list.friendId} /> : null}

        {!created ? <FlywheelCta variant="quiet" /> : null}
      </article>
    </Layout>
  );
};
