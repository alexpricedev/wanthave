import type { BunRequest } from "bun";
import {
  getCardImageBytes,
  getPlaceholderImageBytes,
} from "../../services/card-images";
import { getCardById } from "../../services/cards";

// GET /img/card/:id — same-origin card art proxy (keeps img-src 'self' and
// feeds the OG renderer). Card art is immutable, so cache aggressively.
export const cardImage = {
  async show<T extends `${string}:id${string}`>(
    req: BunRequest<T>,
  ): Promise<Response> {
    const { id } = req.params;
    const bytes = await getCardImageBytes(id);
    if (bytes) {
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    // A card we know about but have no art for is a set that's in the catalogue
    // but not yet mirrored into the bucket, not a bad URL — serve the blank tile,
    // and keep it short-lived so the real art takes over once the sync runs.
    if (!getCardById(id)) {
      return new Response("Card image not found", { status: 404 });
    }
    return new Response(new Uint8Array(await getPlaceholderImageBytes()), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=300",
      },
    });
  },
};
