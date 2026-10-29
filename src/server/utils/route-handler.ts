import type { BunRequest } from "bun";

type Handler<R extends string> = (
  req: BunRequest<R>,
) => Response | Promise<Response>;

export function createRouteHandler<R extends string>(handlers: {
  GET?: Handler<R>;
  POST?: Handler<R>;
  PUT?: Handler<R>;
  DELETE?: Handler<R>;
}) {
  return async (req: BunRequest<R>) => {
    const handler = handlers[req.method as keyof typeof handlers];

    if (!handler) {
      return new Response("Method not allowed", { status: 405 });
    }

    return handler(req);
  };
}
