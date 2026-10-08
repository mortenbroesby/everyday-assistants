/** An inert notice for a previously published viewer URI. It has no bridge or shopping actions. */
export function renderRetiredProductViewerHtml(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Selection card is read only</title>
<style>body{font:16px system-ui,sans-serif;margin:0;padding:20px;color:#202124}main{max-width:38rem;margin:auto}p{line-height:1.5}</style></head>
<body><main><h1>This selection card is out of date</h1><p>This older card is read-only and cannot change shopping data. Ask in the conversation to show the current selection.</p></main>
</body></html>`;
}
