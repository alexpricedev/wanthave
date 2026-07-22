import type { Card } from "../services/cards";
import { getSet, rarityLabel, rarityName } from "../services/cards";
import type { ListCardRow, ListKind } from "../services/lists";
import { groupByRarity } from "../services/lists";
import { formatFriendId } from "../utils/friend-id";

// Card art always comes from our own /img/card proxy, never the CDN directly.
export const cardImageSrc = (card: Card): string => `/img/card/${card.id}`;

interface CardTileProps {
  card: Card;
  quantity?: number;
  kind?: ListKind;
}

// A single card: full-bleed art in a fixed-ratio frame, with an optional
// quantity chip. Used read-only on the public page.
export const CardTile = ({ card, quantity, kind }: CardTileProps) => (
  <button
    type="button"
    className="card-tile"
    data-card-tile
    data-card-name={card.name}
    data-card-set={getSet(card.set)?.name ?? card.set}
    data-card-set-code={card.set}
    data-card-rarity={rarityLabel(card.rarity)}
    data-card-rarity-name={rarityName(card.rarity)}
    data-card-img={cardImageSrc(card)}
    data-card-kind={kind}
  >
    <img
      className="card-tile-img"
      src={cardImageSrc(card)}
      alt={`${card.name} · ${card.set} ${rarityLabel(card.rarity)}`}
      width={367}
      height={512}
      loading="lazy"
    />
    {quantity && quantity > 1 ? (
      <span className="card-qty">×{quantity}</span>
    ) : null}
  </button>
);

interface RaritySectionProps {
  kind: ListKind;
  cards: ListCardRow[];
}

// A want/have section, its cards grouped by rarity (same-rarity swaps).
export const RaritySection = ({ kind, cards }: RaritySectionProps) => {
  const groups = groupByRarity(cards);
  const isWant = kind === "want";
  return (
    <section
      className={`trade-section trade-${kind}`}
      aria-label={isWant ? "Looking for" : "For trade"}
    >
      <header className="trade-section-head">
        <span className={`vlabel-inline ${isWant ? "want" : "have"}`}>
          {isWant ? "WANT" : "HAVE"}
        </span>
        <h2 className="trade-section-title">
          {isWant ? "Looking for" : "For trade"}
        </h2>
        <span className="trade-section-count">{cards.length}</span>
      </header>
      {groups.map((group) => (
        <div key={group.rarity} className="rarity-group">
          <div className="rarity-label">Rarity {rarityLabel(group.rarity)}</div>
          <div className="card-grid">
            {group.cards.map((c) => (
              <CardTile
                key={c.card.id}
                card={c.card}
                quantity={c.quantity}
                kind={kind}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
};

interface CountBadgeProps {
  wantCount: number;
  haveCount: number;
}

// The signature element — hue-coded halves split by an interpunct, Plex Mono.
export const CountBadge = ({ wantCount, haveCount }: CountBadgeProps) => (
  <span className="count-badge">
    <span className="count-want">LF {wantCount}</span>
    <span className="count-sep">·</span>
    <span className="count-have">FT {haveCount}</span>
  </span>
);

interface FriendIdBlockProps {
  friendId: string;
}

// Friend ID with one-tap copy (progressive enhancement — see public.ts island).
export const FriendIdBlock = ({ friendId }: FriendIdBlockProps) => (
  <section className="friend-id-block" aria-label="Friend ID">
    <span className="friend-id-label">Friend ID</span>
    <button
      type="button"
      className="friend-id-copy"
      data-friend-id={friendId}
      data-copy
    >
      <span className="friend-id-value">{formatFriendId(friendId)}</span>
      <span className="friend-id-action" aria-hidden="true">
        Copy
      </span>
    </button>
  </section>
);

// The product's only growth loop — first-class on every public page.
export const FlywheelCta = ({
  variant = "primary",
}: {
  variant?: "primary" | "quiet";
}) => (
  <aside className={`flywheel flywheel-${variant}`}>
    <p className="flywheel-copy">
      Looks like you trade Pokémon TCG Pocket cards? You should build your own{" "}
      <span className="want">want</span>
      <span className="have">have</span> list, it takes less than two minutes
      and you don't need an account.
    </p>
    <a className="btn-primary flywheel-btn" href="/new">
      Create your own trade list
    </a>
  </aside>
);
