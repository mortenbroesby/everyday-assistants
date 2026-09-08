const iterations = 200;
const inputLimit = 16_384;
const started = process.hrtime.bigint();
const { normalizeProducts } = await import("../src/client.js");
const coldNormalizerImportMs = Number(process.hrtime.bigint() - started) / 1_000_000;

const exact = (value: string): string => value.repeat(Math.ceil(inputLimit / value.length)).slice(0, inputLimit);
const fixtures = {
  plain: exact("Mælk og kakao "),
  dense: exact("<p><strong>Mælk</strong><em> og kakao</em></p>"),
  entity: exact("<p>Mælk&nbsp;&amp;&nbsp;kakao&#160;</p>"),
  malformed: exact('<p title="1 > 0"><strong>Mælk &amp; kakao'),
};
const regex = (value: string): string => value.replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ").trim();
const percentile = (samples: number[], fraction: number): number => samples[Math.floor((samples.length - 1) * fraction)] ?? 0;

function measure(run: () => void): { medianMs: number; p95Ms: number; peakRssBytes: number } {
  const samples: number[] = [];
  let peakRssBytes = process.memoryUsage().rss;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const startedAt = process.hrtime.bigint();
    run();
    samples.push(Number(process.hrtime.bigint() - startedAt) / 1_000_000);
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
  }
  samples.sort((left, right) => left - right);
  return { medianMs: percentile(samples, 0.5), p95Ms: percentile(samples, 0.95), peakRssBytes };
}

const normalizeField = (text: string): void => { normalizeProducts([{ Id: 1, Name: "Benchmark", Text: text }], 1); };
const fields = Object.values(fixtures);
const worstProduct = {
  Id: 2,
  Name: "Benchmark",
  Text: fields[0],
  Attributes: Array.from({ length: 20 }, (_, index) => ({
    Key: fields[(index * 2 + 1) % fields.length],
    Value: fields[(index * 2 + 2) % fields.length],
  })),
};
const warmMsPerField = Object.fromEntries(Object.entries(fixtures).map(([name, value]) => [name, {
  converter: measure(() => normalizeField(value)), regex: measure(() => { regex(value); }),
}]));

console.log(JSON.stringify({
  synthetic: true,
  node: process.version,
  iterations,
  inputLimit,
  coldNormalizerImportMs,
  warmMsPerField,
  warmMsPerProduct41Fields: measure(() => { normalizeProducts([worstProduct], 1); }),
  regexComparison: "CPU samples only; not a speed claim.",
}, null, 2));
