import gateway, { NemligMcpContainer } from "./cloudflare-worker.js";
import { timedJourneyContainerFetch } from "./journey-timing.js";
import type {
  AdmissionPolicy,
  AdmissionPrincipal,
} from "./principal-records.js";

export {
  ContainerProxy,
  OwnerLocalBasketStorage,
} from "./cloudflare-worker.js";

// This class is bound exclusively by the synthetic deployment.
export class JourneyContainer extends NemligMcpContainer {
  override entrypoint = ["node", "dist/journey-http.js"];
  override enableInternet = false;
  override allowedHosts = [
    new URL(this.env.NEMLIG_MCP_AUTH0_ISSUER!).hostname,
    "local-basket-state.internal",
  ];

  override admit(principal: AdmissionPrincipal, policy: AdmissionPolicy) {
    return super.admit(principal, policy, false);
  }

  override fetch(request: Request) {
    return timedJourneyContainerFetch(request, {
      isRunning: () => this.ctx.container?.running === true,
      status: async () => (await this.getState()).status,
      ready: () =>
        this.startAndWaitForPorts(this.defaultPort, { abort: request.signal }),
      forward: () => super.fetch(request),
    });
  }
}
JourneyContainer.outboundByHost = NemligMcpContainer.outboundByHost!;

export default {
  fetch(request: Request, env: Parameters<typeof gateway.fetch>[1]) {
    if (new URL(request.url).pathname.startsWith("/connect")) {
      return new Response(null, { status: 404 });
    }
    return gateway.fetch(request, env);
  },
};
