/**
 * Browser-side shim for `@tanstack/react-start` used ONLY in the static GitHub Pages
 * SPA build (`vite.pages.config.ts`). Executes `createServerFn` handlers directly in the
 * browser against the embedded seed catalog, public CORS APIs, and local demo storage.
 */

type ValidatorFn<TIn, TOut> = (input: TIn) => TOut;

interface ServerFnBuilder<TIn = unknown, TOut = TIn> {
  middleware: (_m: unknown[]) => ServerFnBuilder<TIn, TOut>;
  inputValidator: <TValidated>(v: ValidatorFn<TIn, TValidated>) => ServerFnBuilder<TIn, TValidated>;
  handler: <TResult>(
    fn: (args: { data: TOut; context: Record<string, unknown> }) => Promise<TResult> | TResult,
  ) => (arg?: { data?: TIn }) => Promise<TResult>;
}

export function createServerFn(_opts?: { method?: string }): ServerFnBuilder {
  let validator: ValidatorFn<unknown, unknown> | null = null;
  const builder: ServerFnBuilder = {
    middleware() {
      return builder;
    },
    inputValidator(v) {
      validator = v as ValidatorFn<unknown, unknown>;
      return builder as unknown as ServerFnBuilder<unknown, ReturnType<typeof v>>;
    },
    handler(fn) {
      return async (arg?: { data?: unknown }) => {
        const raw = arg && "data" in arg ? arg.data : undefined;
        const data = validator ? validator(raw) : raw;
        return await fn({ data, context: {} });
      };
    },
  };
  return builder;
}

export function createMiddleware(_opts?: unknown) {
  return {
    server: (_fn: unknown) => ({}),
    client: (_fn: unknown) => ({}),
  };
}

export function createStart(fn: () => unknown) {
  return fn;
}

export function createCsrfMiddleware(_opts?: unknown) {
  return {};
}
