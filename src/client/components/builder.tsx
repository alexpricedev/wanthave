/** @jsxImportSource preact */
import { useEffect, useMemo, useRef, useState } from "preact/hooks";

export interface CardDto {
  id: string;
  name: string;
  set: string;
  number: number;
  rarity: "d1" | "d2" | "d3" | "d4" | "s1" | "s2" | "sh1" | "sh2";
  ex: boolean;
}

export interface SetDto {
  code: string;
  name: string | null;
  count: number;
}

interface Item {
  card: CardDto;
  quantity: number;
}

type Kind = "want" | "have";

// The onboarding intro is dismissable; remember the choice for the session so
// returning visitors don't see it again on every new list.
const INTRO_KEY = "wanthave:introDismissed";

export interface BuilderConfig {
  sets: SetDto[];
  csrfToken: string;
  mode: "create" | "edit";
  slug?: string;
  initial?: { wants: Item[]; haves: Item[]; friendId: string; title?: string };
}

const RARITY_LABEL: Record<CardDto["rarity"], string> = {
  d1: "◆1",
  d2: "◆2",
  d3: "◆3",
  d4: "◆4",
  s1: "★1",
  s2: "★2",
  sh1: "✵1",
  sh2: "✵2",
};

const DIAMOND_COUNT: Partial<Record<CardDto["rarity"], number>> = {
  d1: 1,
  d2: 2,
  d3: 3,
  d4: 4,
};

const STAR_COUNT: Partial<Record<CardDto["rarity"], number>> = {
  s1: 1,
  s2: 2,
};

const ASTERISK_COUNT: Partial<Record<CardDto["rarity"], number>> = {
  sh1: 1,
  sh2: 2,
};

const DiamondIcon = () => (
  <span class="rarity-diamond" aria-hidden="true">
    ◆
  </span>
);

const StarIcon = () => (
  <span class="rarity-star" aria-hidden="true">
    ★
  </span>
);

const AsteriskIcon = () => (
  <span class="rarity-asterisk" aria-hidden="true">
    ✵
  </span>
);

const CheckIcon = () => (
  <svg
    class="browse-card-check"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

function RarityDisplay({ rarity }: { rarity: CardDto["rarity"] }) {
  const diamonds = DIAMOND_COUNT[rarity];
  if (diamonds) {
    return (
      <span class="rarity-icons" role="img" aria-label={RARITY_LABEL[rarity]}>
        {Array.from({ length: diamonds }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-count decorative icons, never reordered
          <DiamondIcon key={i} />
        ))}
      </span>
    );
  }
  const stars = STAR_COUNT[rarity];
  if (stars) {
    return (
      <span class="rarity-icons" role="img" aria-label={RARITY_LABEL[rarity]}>
        {Array.from({ length: stars }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-count decorative icons, never reordered
          <StarIcon key={i} />
        ))}
      </span>
    );
  }
  const asterisks = ASTERISK_COUNT[rarity];
  if (asterisks) {
    return (
      <span class="rarity-icons" role="img" aria-label={RARITY_LABEL[rarity]}>
        {Array.from({ length: asterisks }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-count decorative icons, never reordered
          <AsteriskIcon key={i} />
        ))}
      </span>
    );
  }
  return <>{RARITY_LABEL[rarity]}</>;
}

// Ordering used by the "Rarity" sort: diamonds ascending, then stars, then shiny.
const RARITY_RANK: Record<CardDto["rarity"], number> = {
  d1: 1,
  d2: 2,
  d3: 3,
  d4: 4,
  s1: 5,
  s2: 6,
  sh1: 7,
  sh2: 8,
};

type SortField = "number" | "rarity";
type SortDir = "asc" | "desc";
interface SortState {
  field: SortField;
  dir: SortDir;
}

// Sort preference is shared by both pickers (Search + Browse) and remembered for
// the session so it survives tab switches and reloads.
const SORT_KEY = "wanthave:sort";

const loadSort = (): SortState => {
  try {
    const raw = sessionStorage.getItem(SORT_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        field: p.field === "rarity" ? "rarity" : "number",
        dir: p.dir === "desc" ? "desc" : "asc",
      };
    }
  } catch {
    // sessionStorage may be unavailable (private mode) — fall through.
  }
  return { field: "number", dir: "asc" };
};

// Comparator for a card list. "number" orders by set then card number; "rarity"
// leads with rarity band. Direction flips the whole ordering, so descending
// surfaces the highest set numbers / rarest cards first.
const sortCards = (cards: CardDto[], sort: SortState): CardDto[] => {
  const mul = sort.dir === "asc" ? 1 : -1;
  return [...cards].sort((a, b) => {
    if (sort.field === "rarity") {
      const r = RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity];
      if (r !== 0) return r * mul;
    }
    const s = a.set.localeCompare(b.set);
    if (s !== 0) return s * mul;
    return (a.number - b.number) * mul;
  });
};

const imgSrc = (id: string): string => `/img/card/${id}`;

const formatFriendId = (digits: string): string =>
  digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();

// A friend ID is stable per person, so remember it for the session and prefill
// new lists — the same treatment the sort control gets. Stored as bare digits.
const FRIEND_KEY = "wanthave:friend";

const loadFriendId = (): string => {
  try {
    return sessionStorage.getItem(FRIEND_KEY) ?? "";
  } catch {
    // sessionStorage may be unavailable (private mode) — fall through.
    return "";
  }
};

function CardButton({
  card,
  state,
  onAdd,
}: {
  card: CardDto;
  state: Kind | null;
  onAdd: (card: CardDto) => void;
}) {
  return (
    <button
      type="button"
      class={`browse-card${state ? ` in-${state}` : ""}`}
      onClick={() => onAdd(card)}
      title={`${card.name} · ${card.set} ${RARITY_LABEL[card.rarity]}`}
    >
      <span class="browse-card-media">
        <img
          src={imgSrc(card.id)}
          alt={card.name}
          width={183}
          height={256}
          loading="lazy"
        />
        {state ? (
          <span class="browse-card-flag" aria-hidden="true">
            <CheckIcon />
          </span>
        ) : null}
      </span>
      <span class="browse-card-caption">
        <span class="browse-card-name">{card.name}</span>
        <span class="browse-card-rarity">
          <RarityDisplay rarity={card.rarity} />
        </span>
      </span>
    </button>
  );
}

function ListItem({
  item,
  index,
  total,
  onQty,
  onMove,
  onRemove,
}: {
  item: Item;
  index: number;
  total: number;
  onQty: (id: string, delta: number) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onRemove: (id: string) => void;
}) {
  const { card } = item;
  return (
    <li class="list-item">
      <img
        class="list-item-img"
        src={imgSrc(card.id)}
        alt={card.name}
        width={44}
        height={62}
        loading="lazy"
      />
      <div class="list-item-body">
        <span class="list-item-name">{card.name}</span>
        <span class="list-item-meta">
          {card.set} · {RARITY_LABEL[card.rarity]}
        </span>
      </div>
      <div class="qty-stepper">
        <button
          type="button"
          onClick={() => onQty(card.id, -1)}
          aria-label="Decrease quantity"
          disabled={item.quantity <= 1}
        >
          −
        </button>
        <span class="qty-value">{item.quantity}</span>
        <button
          type="button"
          onClick={() => onQty(card.id, 1)}
          aria-label="Increase quantity"
        >
          +
        </button>
      </div>
      <div class="reorder">
        <button
          type="button"
          onClick={() => onMove(card.id, -1)}
          aria-label="Move up"
          disabled={index === 0}
        >
          ↑
        </button>
        <button
          type="button"
          onClick={() => onMove(card.id, 1)}
          aria-label="Move down"
          disabled={index === total - 1}
        >
          ↓
        </button>
      </div>
      <button
        type="button"
        class="remove-btn"
        onClick={() => onRemove(card.id)}
        aria-label={`Remove ${card.name}`}
      >
        ×
      </button>
    </li>
  );
}

export function Builder(config: BuilderConfig) {
  const initial = config.initial ?? null;
  const [wants, setWants] = useState<Item[]>(initial?.wants ?? []);
  const [haves, setHaves] = useState<Item[]>(initial?.haves ?? []);
  const [friendId, setFriendId] = useState<string>(
    initial?.friendId || loadFriendId(),
  );
  const [title, setTitle] = useState<string>(initial?.title ?? "");
  const [target, setTarget] = useState<Kind>("want");

  // Two-step flow: pick cards first, then an optional details step (list name +
  // friend ID) shown only after the primary button is pressed.
  const [phase, setPhase] = useState<"cards" | "details">("cards");

  // One unified picker: a search box plus a set filter ("all" = every set). A
  // bare set browses it; a query searches (within the set if one is chosen).
  const [query, setQuery] = useState("");
  const [activeSet, setActiveSet] = useState("all");
  const [sort, setSort] = useState<SortState>(loadSort);
  const [cards, setCards] = useState<CardDto[]>([]);
  const [loading, setLoading] = useState(false);
  const cardCache = useRef<Map<string, CardDto[]>>(new Map());

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placement = useMemo(() => {
    const map = new Map<string, Kind>();
    for (const it of wants) map.set(it.card.id, "want");
    for (const it of haves) map.set(it.card.id, "have");
    return map;
  }, [wants, haves]);

  const sortedCards = useMemo(() => sortCards(cards, sort), [cards, sort]);

  // Remember the sort choice for the session.
  useEffect(() => {
    try {
      sessionStorage.setItem(SORT_KEY, JSON.stringify(sort));
    } catch {
      // sessionStorage may be unavailable — non-fatal.
    }
  }, [sort]);

  // The onboarding banner lives outside the Preact root (server-rendered, so
  // it's visible before hydration). Keep it in sync with phase: always hidden
  // on the details step, restored to its dismissed/shown state on cards.
  useEffect(() => {
    const intro = document.getElementById("builder-intro");
    if (!intro) return;

    if (phase === "details") {
      intro.hidden = true;
      return;
    }

    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(INTRO_KEY) === "1";
    } catch {
      // sessionStorage may be unavailable (private mode) — treat as not dismissed.
    }
    intro.hidden = dismissed;

    const close = document.getElementById("builder-intro-close");
    if (!close) return;
    const onClose = () => {
      intro.hidden = true;
      try {
        sessionStorage.setItem(INTRO_KEY, "1");
      } catch {
        // sessionStorage may be unavailable — non-fatal.
      }
    };
    close.addEventListener("click", onClose);
    return () => close.removeEventListener("click", onClose);
  }, [phase]);

  // Remember the friend ID for the session so it prefills future lists.
  useEffect(() => {
    try {
      sessionStorage.setItem(FRIEND_KEY, friendId.replace(/\D/g, ""));
    } catch {
      // sessionStorage may be unavailable — non-fatal.
    }
  }, [friendId]);

  // Unified, debounced fetch: browse a set, search all sets, or search within a
  // set — whichever the current (set, query) pair implies.
  useEffect(() => {
    const q = query.trim();
    // Idle default: no set, no query — show nothing (the grid prompts instead).
    if (activeSet === "all" && q.length === 0) {
      setCards([]);
      setLoading(false);
      return;
    }
    const key = `${activeSet}|${q}`;
    const cached = cardCache.current.get(key);
    if (cached) {
      setCards(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (activeSet !== "all") params.set("set", activeSet);
        if (q) params.set("q", q);
        const res = await fetch(`/api/cards?${params.toString()}`);
        const data = await res.json();
        const list: CardDto[] = data.cards ?? [];
        cardCache.current.set(key, list);
        setCards(list);
      } catch {
        setCards([]);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [query, activeSet]);

  const addCard = (card: CardDto) => {
    setError(null);
    const current = placement.get(card.id);
    if (current === target) {
      // Tapping a card already in the target list removes it.
      if (target === "want")
        setWants((l) => l.filter((i) => i.card.id !== card.id));
      else setHaves((l) => l.filter((i) => i.card.id !== card.id));
      return;
    }
    // Remove from the other list if present (a card lives in one list only).
    setWants((l) => l.filter((i) => i.card.id !== card.id));
    setHaves((l) => l.filter((i) => i.card.id !== card.id));
    const item = { card, quantity: 1 };
    if (target === "want") setWants((l) => [...l, item]);
    else setHaves((l) => [...l, item]);
  };

  const changeQty = (setter: typeof setWants) => (id: string, delta: number) =>
    setter((l) =>
      l.map((i) =>
        i.card.id === id
          ? { ...i, quantity: Math.max(1, Math.min(99, i.quantity + delta)) }
          : i,
      ),
    );

  const move = (setter: typeof setWants) => (id: string, dir: -1 | 1) =>
    setter((l) => {
      const idx = l.findIndex((i) => i.card.id === id);
      const next = idx + dir;
      if (idx < 0 || next < 0 || next >= l.length) return l;
      const copy = [...l];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy;
    });

  const remove = (setter: typeof setWants) => (id: string) =>
    setter((l) => l.filter((i) => i.card.id !== id));

  const totalCards = wants.length + haves.length;
  const friendDigits = friendId.replace(/\D/g, "");
  const friendValid = friendDigits.length === 0 || friendDigits.length === 16;

  const submit = async () => {
    setError(null);
    if (totalCards === 0) {
      setError("Add at least one card before creating a link.");
      return;
    }
    if (!friendValid) {
      setError("A friend ID is 16 digits. Check it, or clear it to skip.");
      return;
    }
    setSubmitting(true);
    const cards = [
      ...wants.map((i) => ({
        cardId: i.card.id,
        kind: "want",
        quantity: i.quantity,
      })),
      ...haves.map((i) => ({
        cardId: i.card.id,
        kind: "have",
        quantity: i.quantity,
      })),
    ];
    const payload = { cards, friendId: friendDigits, title: title.trim() };
    try {
      const url =
        config.mode === "edit" ? `/api/lists/${config.slug}` : "/api/lists";
      const res = await fetch(url, {
        method: config.mode === "edit" ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": config.csrfToken,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Try again.");
        setSubmitting(false);
        return;
      }
      const data = await res.json();
      const dest =
        config.mode === "edit"
          ? `/l/${data.slug}`
          : `/l/${data.slug}?created=1`;
      window.location.href = dest;
    } catch {
      setError("Network error. Try again.");
      setSubmitting(false);
    }
  };

  // Step 1 primary action: guard on at least one card, then advance to the
  // optional details step rather than submitting straight away.
  const goToDetails = () => {
    setError(null);
    if (totalCards === 0) {
      setError("Add at least one card before creating a link.");
      return;
    }
    setPhase("details");
  };

  // Shared sort control for both pickers: field toggle (Number / Rarity) plus a
  // direction button (ascending / descending — descending shows the highest set
  // numbers and rarest cards first).
  const renderSortControl = () => (
    <div class="sort-row">
      <span class="sort-label">Sort</span>
      <div class="sort-toggle">
        <button
          type="button"
          class={sort.field === "number" ? "active" : ""}
          aria-pressed={sort.field === "number"}
          onClick={() => setSort((s) => ({ ...s, field: "number" }))}
        >
          Number
        </button>
        <button
          type="button"
          class={sort.field === "rarity" ? "active" : ""}
          aria-pressed={sort.field === "rarity"}
          onClick={() => setSort((s) => ({ ...s, field: "rarity" }))}
        >
          Rarity
        </button>
      </div>
      <button
        type="button"
        class="sort-dir"
        onClick={() =>
          setSort((s) => ({ ...s, dir: s.dir === "asc" ? "desc" : "asc" }))
        }
        aria-label={
          sort.dir === "asc"
            ? "Sorted ascending — lowest first. Switch to highest first."
            : "Sorted descending — highest first. Switch to lowest first."
        }
        title={sort.dir === "asc" ? "Lowest first" : "Highest first"}
      >
        <span aria-hidden="true">{sort.dir === "asc" ? "↑" : "↓"}</span>
      </button>
      {query.trim().length > 0 || activeSet !== "all" ? (
        <button
          type="button"
          class="sort-clear"
          onClick={() => {
            setQuery("");
            setActiveSet("all");
          }}
        >
          Clear
        </button>
      ) : null}
    </div>
  );

  const renderList = (items: Item[], kind: Kind) => {
    const setter = kind === "want" ? setWants : setHaves;
    return items.length === 0 ? (
      <p class="list-empty text-tertiary">
        {kind === "want"
          ? "Add the cards you're looking for."
          : "Add the cards you have for trade."}
      </p>
    ) : (
      <ol class="trade-list">
        {items.map((item, i) => (
          <ListItem
            key={item.card.id}
            item={item}
            index={i}
            total={items.length}
            onQty={changeQty(setter)}
            onMove={move(setter)}
            onRemove={remove(setter)}
          />
        ))}
      </ol>
    );
  };

  if (phase === "details") {
    return (
      <div class="builder">
        <div class="builder-details">
          {/* Replaces the dismissable onboarding banner (hidden on this step —
              see the intro-sync effect above) with a fixed, non-closable note
              scoped to what this step actually asks for. */}
          <div class="builder-details-note">
            Give your list a name so you know what in it at a later date and add
            your Friend ID so people can easily add you and initiate trades
          </div>

          <span class="count-badge">
            <span class="count-want">LF {wants.length}</span>
            <span class="count-sep">·</span>
            <span class="count-have">FT {haves.length}</span>
          </span>

          {/* List name + Friend ID — optional details, collected on this step
              so they don't crowd the card picker. */}
          <div class="builder-meta builder-meta--stack">
            <section class="builder-friend">
              <label class="friend-label" for="list-title-input">
                List name <span class="text-tertiary">(optional)</span>
              </label>
              <input
                id="list-title-input"
                type="text"
                class="friend-input"
                placeholder="Everyday Wonders Wants, All Spares"
                maxLength={80}
                value={title}
                onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
              />
            </section>

            <section class="builder-friend">
              <label class="friend-label" for="friend-id-input">
                Friend ID{" "}
                <span class="text-tertiary">(optional, 16 digits)</span>
              </label>
              <input
                id="friend-id-input"
                type="text"
                inputMode="numeric"
                class={`friend-input${friendValid ? "" : " invalid"}`}
                placeholder="1234567890123456"
                value={formatFriendId(friendDigits)}
                onInput={(e) =>
                  setFriendId((e.target as HTMLInputElement).value)
                }
              />
              {!friendValid ? (
                <span class="friend-warn">A friend ID is 16 digits.</span>
              ) : null}
            </section>
          </div>

          {error ? (
            <p class="builder-error" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            class="builder-submit"
            onClick={submit}
            disabled={submitting}
          >
            {submitting
              ? "Creating…"
              : config.mode === "edit"
                ? "Save changes"
                : "Create link"}
          </button>

          <button
            type="button"
            class="btn-ghost builder-back"
            onClick={() => setPhase("cards")}
          >
            ← Back to cards
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class={`builder mode-${target}`}>
      {/* Full-viewport mode frame: a coloured border around the whole screen so
          the active list is unmistakable (amber = WANT, ice = HAVE). Decorative
          and non-interactive. */}
      <div class="builder-frame" aria-hidden="true" />

      {/* Mode switch, pinned to the top. The builder is always in one "mode" —
          every card you tap lands in the active list — so this is the first
          thing you choose and it stays in reach while you scroll the cards. */}
      <div class="builder-modebar">
        <div class="modebar-inner">
          <span class="modebar-label">Tap cards to add to</span>
          <div class="mode-seg">
            <button
              type="button"
              class={`mode-opt want${target === "want" ? " active" : ""}`}
              onClick={() => setTarget("want")}
              aria-pressed={target === "want"}
            >
              WANT
            </button>
            <button
              type="button"
              class={`mode-opt have${target === "have" ? " active" : ""}`}
              onClick={() => setTarget("have")}
              aria-pressed={target === "have"}
            >
              HAVE
            </button>
          </div>
        </div>
      </div>

      <div class="builder-picker">
        <div class="picker-controls">
          <div class="picker-field picker-field--search">
            <label class="friend-label" for="card-search-input">
              Search cards
            </label>
            <input
              id="card-search-input"
              type="search"
              class="search-input"
              placeholder="Try “RR chsr EX”, “shiny pika” or “FA trainer”…"
              value={query}
              onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="picker-field picker-field--set">
            <label class="friend-label" for="set-select">
              Filter by set
            </label>
            <select
              id="set-select"
              class="set-select"
              value={activeSet}
              onChange={(e) =>
                setActiveSet((e.target as HTMLSelectElement).value)
              }
            >
              <option value="all">All sets</option>
              {config.sets.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name ? `${s.code} · ${s.name}` : s.code} ({s.count})
                </option>
              ))}
            </select>
          </div>
        </div>

        {cards.length > 0 ? renderSortControl() : null}

        <div class="browse-grid" aria-live="polite">
          {activeSet === "all" && query.trim().length === 0 ? (
            <p class="picker-hint text-tertiary">
              Search for a card, or pick a set to browse.
            </p>
          ) : loading && cards.length === 0 ? (
            <p class="picker-hint text-tertiary">Loading…</p>
          ) : cards.length === 0 ? (
            <p class="picker-hint text-tertiary">
              No matches. Try a different spelling
              {activeSet === "all" ? "." : " or another set."}
            </p>
          ) : (
            sortedCards.map((card) => (
              <CardButton
                key={card.id}
                card={card}
                state={placement.get(card.id) ?? null}
                onAdd={addCard}
              />
            ))
          )}
        </div>
      </div>

      <div class="builder-lists">
        <section class="builder-section">
          <header class="builder-section-head">
            <span class="vlabel-inline want">WANT</span>
            <h2>Looking for</h2>
            <span class="section-count">{wants.length}</span>
          </header>
          {renderList(wants, "want")}
        </section>

        <section class="builder-section">
          <header class="builder-section-head">
            <span class="vlabel-inline have">HAVE</span>
            <h2>For trade</h2>
            <span class="section-count">{haves.length}</span>
          </header>
          {renderList(haves, "have")}
        </section>

        {error ? (
          <p class="builder-error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          class="builder-submit"
          onClick={goToDetails}
          disabled={totalCards === 0}
        >
          {config.mode === "edit" ? "Save changes" : "Create shareable link"}
        </button>
        <p class="builder-hint text-tertiary">
          {totalCards === 0
            ? "Add at least one card to continue."
            : `${wants.length} in WANT · ${haves.length} in HAVE`}
        </p>
      </div>
    </div>
  );
}
