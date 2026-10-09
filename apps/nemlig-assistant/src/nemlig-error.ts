export class NemligError extends Error {
  override readonly name: string = 'NemligError';

  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}
