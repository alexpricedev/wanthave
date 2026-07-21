import type { BunRequest } from "bun";
import { getCardImageBytes } from "../../services/card-images";

// GET /img/card/:id — same-origin card art proxy (keeps img-src 'self' and
// feeds the OG renderer). Card art is immutable, so cache aggressively.
export const cardImage = {
  async show<T extends `${string}:id${string}`>(
    req: BunRequest<T>,
  ): Promise<Response> {
    const bytes = await getCardImageBytes(req.params.id);
    if (!bytes) {
      return new Response("Card image not found", { status: 404 });
    }
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  },
};
