import {
  getCardImage,
  getPlaceholderImageBytes,
} from "../../services/card-images";
import { getCardById } from "../../services/cards";
import type { IdRequest } from "../../utils/request";

// GET /img/card/:id — same-origin card art proxy (keeps img-src 'self' and
// feeds the OG renderer). Card art is immutable, so cache aggressively.
export const cardImage = {
  async show(req: IdRequest): Promise<Response> {
    const { id } = req.params;
    const image = await getCardImage(id);
    if (image.status === "ok") {
      return new Response(new Uint8Array(image.bytes), {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    // The bucket didn't answer. Say so rather than dressing a transient failure
    // up as a 200: a placeholder here would be cached by the CDN and outlive the
    // blip, and a wholesale outage (bad credentials, say) would show as a site
    // full of blank tiles instead of something obviously wrong.
    if (image.status === "error") {
      return new Response("Card image temporarily unavailable", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
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
