import { Context } from "hono";
import { BlankEnv, BlankInput } from "hono/types";
import { debug } from "./logger";

/**
 * Checks if a DEGOOG_I18N environment variable exists, if not uses
 * the Accept-Language header to determine the locale.
 *
 * @param c - The Hono context object.
 * @returns The locale string.
 */
export function getLocale(
  c: Context<BlankEnv, "/", BlankInput>,
): string | undefined {
  const override = process.env.DEGOOG_I18N?.trim();

  if (override) {
    debug(
      "translation",
      `Locale forced by DEGOOG_I18N: "${override}"`,
      undefined,
    );
    return override;
  }
  return c.req.header("Accept-Language")?.split(",")[0].trim();
}
