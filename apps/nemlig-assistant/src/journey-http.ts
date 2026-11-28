import { startHttpServer } from "./http.js";
import { createJourneyShopper } from "./journey-shopper.js";

startHttpServer(process.env, createJourneyShopper).catch(() => {
  console.error("Synthetic shopping server failed to start.");
  process.exitCode = 1;
});
