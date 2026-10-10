const CAPABILITY_HEADER = "x-nemlig-local-basket-capability";
const PRINCIPAL_KEY = /^[A-Za-z0-9_-]{32,64}$/u;

const activeCapabilities = new Map<string, string>();

const assertPrincipalKey = (principalKey: string): void => {
  if (!PRINCIPAL_KEY.test(principalKey)) {
    throw new Error("Local basket capability principal is invalid.");
  }
};

/**
 * Grants the Container one callback capability for the lifetime of its
 * authenticated inbound request. It is not a credential and is erased when
 * that request finishes.
 */
export const withLocalBasketCapability = async <Result>(
  principalKey: string,
  action: (capability: string) => Promise<Result>,
): Promise<Result> => {
  assertPrincipalKey(principalKey);
  const capability = crypto.randomUUID();
  activeCapabilities.set(capability, principalKey);
  try {
    return await action(capability);
  } finally {
    activeCapabilities.delete(capability);
  }
};

/** Returns the Worker-authenticated owner for a currently forwarded request. */
export const localBasketCapabilityOwner = (
  request: Request,
): string | undefined => {
  const capability = request.headers.get(CAPABILITY_HEADER);
  return capability ? activeCapabilities.get(capability) : undefined;
};

/** Attaches the ephemeral callback capability without retaining caller headers. */
export const attachLocalBasketCapability = (
  request: Request,
  capability: string,
): Request => {
  const headers = new Headers(request.headers);
  headers.delete(CAPABILITY_HEADER);
  headers.set(CAPABILITY_HEADER, capability);
  return new Request(request, { headers });
};

export { CAPABILITY_HEADER };
