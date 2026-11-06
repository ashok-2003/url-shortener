import "server-only";

type Fields = Record<string, unknown>;

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { name: "NonError", message: String(error) };
}

function line(level: string, event: string, fields: Fields = {}): string {
  const { error, ...rest } = fields;
  return JSON.stringify({
    level,
    event,
    time: new Date().toISOString(),
    ...rest,
    ...(error === undefined ? {} : { error: serializeError(error) }),
  });
}

/** The only place in `src/server` allowed to touch `console`. */
export const log = {
  info: (event: string, fields?: Fields) =>
    console.log(line("info", event, fields)),
  warn: (event: string, fields?: Fields) =>
    console.warn(line("warn", event, fields)),
  error: (event: string, fields?: Fields & { error?: unknown }) =>
    console.error(line("error", event, fields)),
};
