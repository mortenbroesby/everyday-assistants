const CAPABILITY_HEADER = "x-nemlig-local-basket-capability";

/** Extracts the short-lived token; only the Container Durable Object resolves it. */
export const localBasketCapability = (request: Request): string | undefined =>
  request.headers.get(CAPABILITY_HEADER) ?? undefined;

/** Attaches an ephemeral capability to Container egress without retaining caller headers. */
export const attachLocalBasketCapability = (
  request: Request,
  capability: string,
): Request => {
  const headers = new Headers(request.headers);
  headers.delete(CAPABILITY_HEADER);
  headers.set(CAPABILITY_HEADER, capability);
  return new Request(request, { headers });
};

/** Keep callback authority alive through a streamed Container response, then revoke it. */
export const revokeWhenBodyEnds = async (
  response: Response,
  revoke: () => Promise<void>,
): Promise<Response> => {
  if (!response.body) {
    await revoke();
    return response;
  }
  const reader = response.body.getReader();
  let revoked = false;
  const finish = async (): Promise<void> => {
    if (!revoked) {
      revoked = true;
      await revoke();
    }
  };
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          controller.close();
          await finish();
        } else {
          controller.enqueue(chunk.value);
        }
      } catch (error) {
        controller.error(error);
        await finish();
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        await finish();
      }
    },
  });
  return new Response(body, response);
};
