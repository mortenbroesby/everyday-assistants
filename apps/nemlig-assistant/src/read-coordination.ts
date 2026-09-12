import { Cause, Effect, Exit, Option } from "effect";

export const DEFAULT_READ_CONCURRENCY = 3;

export const abortReason = (signal: AbortSignal): unknown =>
  signal.reason ?? new DOMException("Read coordination was cancelled.", "AbortError");

const waitForAbort = (signal: AbortSignal): Effect.Effect<never, unknown> => Effect.async((resume) => {
  const abort = () => resume(Effect.fail(abortReason(signal)));
  if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
  return Effect.sync(() => signal.removeEventListener("abort", abort));
});

export type SettledRead = <T>(operation: (signal: AbortSignal) => Promise<T>) => Effect.Effect<T, unknown>;

/** Tracks abort-aware Promises so a coordinator can prove quiescence before returning. */
export const createReadScope = (): { read: SettledRead; awaitQuiescence: () => Promise<void> } => {
  const pending = new Set<Promise<unknown>>();
  function read<T>(operation: (signal: AbortSignal) => Promise<T>): Effect.Effect<T, unknown> {
    return Effect.async<T, unknown>((resume, signal) => {
      const settled = Promise.resolve().then(() => operation(signal));
      pending.add(settled);
      void settled.then(() => pending.delete(settled), () => pending.delete(settled));
      settled.then((value) => resume(Effect.succeed(value)), (error: unknown) => resume(Effect.fail(error)));
      return Effect.uninterruptible(Effect.promise(() => settled.then(() => undefined, () => undefined)));
    });
  }
  return {
    read,
    awaitQuiescence: async () => { await Promise.allSettled([...pending]); },
  };
};

/** Runs one Effect scope with optional caller cancellation and preserves failure identity. */
export async function runAbortableEffect<T>(program: Effect.Effect<T, unknown>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw abortReason(signal);
  const scoped = signal === undefined ? program : Effect.raceFirst(program, waitForAbort(signal));
  const exit = await Effect.runPromiseExit(scoped);
  if (!Exit.isSuccess(exit)) {
    const failure = Cause.failureOption(exit.cause);
    throw (Option.isSome(failure) ? failure.value : Cause.squash(exit.cause));
  }
  return exit.value;
}

export interface ReadPoolOptions {
  readonly signal?: AbortSignal;
  readonly concurrency?: number;
}

/** Runs an ordered request-local work set with bounded starts and quiescent failure. */
export async function runReadPool<Input, Output>(
  inputs: readonly Input[],
  operation: (input: Input, signal: AbortSignal) => Promise<Output>,
  options: ReadPoolOptions = {},
): Promise<Output[]> {
  const concurrency = options.concurrency ?? DEFAULT_READ_CONCURRENCY;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError("Read concurrency must be a positive integer.");
  }
  const reads = createReadScope();
  try {
    return await runAbortableEffect(
      Effect.forEach(inputs, (input) => reads.read((signal) => operation(input, signal)), { concurrency }),
      options.signal,
    );
  } finally {
    await reads.awaitQuiescence();
  }
}
