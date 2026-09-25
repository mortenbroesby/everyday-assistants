/** A compatibility page for cached MCP Apps clients. It never hydrates old review data. */
export function renderRetiredProductViewerHtml(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Review card updated</title>
<style>body{font:16px system-ui,sans-serif;margin:0;padding:20px;color:#202124}main{max-width:38rem;margin:auto}button{font:inherit;padding:10px 14px;border:0;border-radius:8px;background:#176b45;color:white;cursor:pointer}p{line-height:1.5}</style></head>
<body><main><h1>This review card is retired</h1><p>Use the current review card to continue. This card does not load or change shopping data.</p>
<button id="open" type="button">Open the current review</button><p id="fallback" hidden>In the conversation, ask: “Open my current local shopping review.”</p></main>
<script>
(() => {
  "use strict";
  const button = document.getElementById("open");
  const fallback = document.getElementById("fallback");
  const prompt = "Open my current local shopping review.";
  let requestNumber = 0;
  const request = (method, params, timeoutMs) => new Promise((resolve, reject) => {
    const id = "retired-review-" + (++requestNumber);
    const timer = setTimeout(() => {
      window.removeEventListener("message", receive);
      reject(new Error("The host did not confirm the request."));
    }, timeoutMs);
    const receive = event => {
      if (event.source !== window.parent || event.data?.jsonrpc !== "2.0" || event.data.id !== id) return;
      clearTimeout(timer);
      window.removeEventListener("message", receive);
      if (event.data.error) reject(new Error("The host rejected the request."));
      else resolve(event.data.result);
    };
    window.addEventListener("message", receive);
    window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
  });
  const showFallback = message => {
    fallback.hidden = false;
    fallback.textContent = message;
  };

  button.addEventListener("click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = "Opening current review…";
    if (window.openai && typeof window.openai.sendFollowUpMessage === "function") {
      let timer;
      try {
        await Promise.race([
          window.openai.sendFollowUpMessage({ prompt }),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Unconfirmed request")), 10000); }),
        ]);
        return;
      } catch {
        showFallback("The request may have reached the conversation. Check there before trying again.");
        return;
      } finally { clearTimeout(timer); }
    }
    try {
      await request("ui/initialize", {
        appInfo: { name: "nemlig-retired-review-card", version: "1" },
        appCapabilities: {},
        protocolVersion: "2026-01-26",
      }, 3000);
      window.parent.postMessage({ jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} }, "*");
    } catch {
      button.disabled = false;
      button.textContent = "Open the current review";
      showFallback("In the conversation, ask: “Open my current local shopping review.”");
      return;
    }
    try {
      await request("ui/message", { role: "user", content: [{ type: "text", text: prompt }] }, 10000);
    } catch {
      showFallback("The request may have reached the conversation. Check there before trying again.");
    }
  });
})();
</script>
</body></html>`;
}
