type ContainerState = "cold" | "warm" | "starting" | "stopping";

interface JourneyTiming {
  auth_ms?: number;
  ready_ms?: number;
  mcp_headers_ms?: number;
  container_state?: ContainerState;
}

const MAX_DURATION_MS = 120_000;

/** Matches the upper bound on gateway terminal events. */
export const boundedDuration = (duration: number): number =>
  Math.min(MAX_DURATION_MS, Math.max(0, Math.round(duration)));

/** Select only the fixed measurement fields that may appear in a journey report. */
export function readJourneyTiming(headers: Headers): JourneyTiming {
  const timing: JourneyTiming = {};
  for (const raw of (headers.get("server-timing") ?? "").split(",")) {
    const metric = raw.trim();
    const state = /^container;desc="(cold|warm|starting|stopping)"$/u.exec(
      metric,
    );
    if (state) {
      timing.container_state = state[1] as ContainerState;
      continue;
    }
    const duration = /^(auth|ready|mcp_headers);dur=(\d{1,6})$/u.exec(metric);
    if (duration && Number(duration[2]) <= MAX_DURATION_MS) {
      timing[`${duration[1]}_ms` as "auth_ms" | "ready_ms" | "mcp_headers_ms"] =
        Number(duration[2]);
    }
  }
  return timing;
}

interface JourneyContainer {
  isRunning(): boolean;
  status(): Promise<string>;
  ready(): Promise<void>;
  forward(): Promise<Response>;
  now?(): number;
}

/** Used only by the synthetic container. Measure at the SDK's port-ready boundary. */
export async function timedJourneyContainerFetch(
  request: Request,
  container: JourneyContainer,
): Promise<Response> {
  const now = container.now ?? Date.now;
  const startedAt = now();
  const running = container.isRunning();
  const status = await container.status();
  const state: ContainerState = !running
    ? "cold"
    : status === "healthy"
      ? "warm"
      : status === "stopping"
        ? "stopping"
        : "starting";
  const metrics = [`container;desc="${state}"`];
  let response: Response;
  try {
    request.signal.throwIfAborted();
    if (state !== "warm") {
      await container.ready();
    }
  } catch {
    response = new Response("Container readiness failed", { status: 503 });
    metrics.push(`ready;dur=${boundedDuration(now() - startedAt)}`);
    response.headers.set("server-timing", metrics.join(", "));
    return response;
  }
  const readyAt = now();
  metrics.push(`ready;dur=${boundedDuration(readyAt - startedAt)}`);
  response = await container.forward();
  metrics.push(`mcp_headers;dur=${boundedDuration(now() - readyAt)}`);
  const timed = new Response(response.body, response);
  timed.headers.set("server-timing", metrics.join(", "));
  return timed;
}
