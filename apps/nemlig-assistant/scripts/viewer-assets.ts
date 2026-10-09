import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export interface ViewerAsset {
  url: string;
  integrity: string;
}

export interface ViewerAssetManifest {
  schemaVersion: 1;
  build: string;
  js: ViewerAsset;
  css: ViewerAsset;
}

export function createViewerAssets(html: string): {
  manifest: ViewerAssetManifest;
  files: Map<string, string>;
} {
  const scripts = [
    ...html.matchAll(/<script type="module"[^>]*>([\s\S]*?)<\/script>/gu),
  ];
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gu)];
  assert.equal(scripts.length, 1, "expected one bundled UI script");
  assert.equal(styles.length, 1, "expected one bundled UI stylesheet");

  const file = (source: string, extension: "js" | "css"): ViewerAsset => {
    const bytes = Buffer.from(source);
    const digest = createHash("sha256").update(bytes).digest();
    const hex = Buffer.from(digest).toString("hex");
    return {
      url: `/ui/nemlig/assets/${hex}.${extension}`,
      integrity: `sha256-${Buffer.from(digest).toString("base64")}`,
    };
  };
  const js = `if(new URL(import.meta.url).searchParams.get("attempt")!==window.__nemligViewerAttempt)throw Error("Stale viewer bundle");\n${scripts[0]![1]}`;
  const css = styles[0]![1];
  const jsAsset = file(js, "js");
  const cssAsset = file(css, "css");
  const build = Buffer.from(
    createHash("sha256")
      .update(`${jsAsset.integrity}\n${cssAsset.integrity}`)
      .digest(),
  ).toString("hex");

  return {
    manifest: { schemaVersion: 1, build, js: jsAsset, css: cssAsset },
    files: new Map([
      [jsAsset.url, js],
      [cssAsset.url, css],
    ]),
  };
}
