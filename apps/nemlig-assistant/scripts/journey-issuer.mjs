// Installed only in the temporary local Worker and its container process.
// Only public verification material is shared with either runtime.
export function installJourneyIssuer(jwk) {
  const { URL, Request, Response } = globalThis;
  const issuer = "https://journey-issuer.invalid/";
  const metadata = {
    issuer,
    authorization_endpoint: issuer + "authorize",
    token_endpoint: issuer + "token",
    jwks_uri: issuer + "jwks",
    response_types_supported: ["code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    code_challenge_methods_supported: ["S256"],
  };
  const fetchNext = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.origin !== new URL(issuer).origin) {
      return fetchNext(input, init);
    }
    if (url.href === issuer + ".well-known/openid-configuration") {
      return Promise.resolve(Response.json(metadata));
    }
    if (url.href === issuer + "jwks") {
      return Promise.resolve(Response.json({ keys: [jwk] }));
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  };
}
