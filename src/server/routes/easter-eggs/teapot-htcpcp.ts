const HTCPCP_VERSION = "1.0";
const TEAPOT_STATUS_TEXT = "I'm a teapot";
const MEDIA_TEA = "message/teapot";
const TEXT_PLAIN = "text/plain; charset=UTF-8";
const TEA_VARIETIES = ["darjeeling", "earl-grey", "peppermint"] as const;
const TEAPOT_ALLOW = "GET, HEAD, POST, BREW, PROPFIND, WHEN, OPTIONS";

const mediaTypeOf = (contentType: string | undefined): string =>
  contentType?.split(";")[0]?.trim().toLowerCase() ?? "";

export const isTeaMessage = (contentType: string | undefined): boolean =>
  mediaTypeOf(contentType) === MEDIA_TEA;

export const isTeaVariety = (variety: string): boolean =>
  (TEA_VARIETIES as readonly string[]).includes(variety);

export const htcpcpHeaders = (
  contentType: string,
  extra: Record<string, string> = {},
): HeadersInit => ({
  "Content-Type": contentType,
  HTCPCP: HTCPCP_VERSION,
  "HTCPCP-TEA": HTCPCP_VERSION,
  Allow: TEAPOT_ALLOW,
  ...extra,
});

export const refuseCoffee = (
  body: string | null = TEAPOT_STATUS_TEXT,
  contentType?: string,
): Response =>
  new Response(body, {
    status: 418,
    statusText: TEAPOT_STATUS_TEXT,
    headers: htcpcpHeaders(contentType ?? (body === null ? TEXT_PLAIN : MEDIA_TEA), {
      Safe: "no",
    }),
  });

export const teaMenu = (basePath: string): Response => {
  const alternates = TEA_VARIETIES.map(
    (variety) => `{"${basePath}/teapot/${variety}" {type ${MEDIA_TEA}}}`,
  ).join(", ");
  return new Response("This pot brews tea. Pick a variety.", {
    status: 300,
    headers: htcpcpHeaders(MEDIA_TEA, {
      Alternates: alternates,
      Safe: "yes",
    }),
  });
};

export const brewTea = (rawBody: string): Response => {
  const command = rawBody.trim().toLowerCase();
  const payload = command === "stop" ? "stop" : "start";
  return new Response(payload, {
    status: 200,
    headers: htcpcpHeaders(MEDIA_TEA, { Safe: "if-user-awake" }),
  });
};

export const noAdditions = (): Response =>
  new Response(
    "In practice, most automated coffee pots cannot currently provide additions.",
    {
      status: 406,
      headers: htcpcpHeaders(TEXT_PLAIN),
    },
  );

export const sayWhen = (): Response =>
  new Response("when? there is no milk", {
    status: 406,
    headers: htcpcpHeaders(TEXT_PLAIN),
  });

export const potProps = (): Response =>
  new Response("short: yes\nstout: yes\ncoffee: no\n", {
    status: 200,
    headers: htcpcpHeaders(TEXT_PLAIN, { Safe: "yes" }),
  });

export const teapotOptions = (): Response =>
  new Response(null, {
    status: 204,
    headers: htcpcpHeaders(TEXT_PLAIN),
  });

export const wantsAdditions = (header: string | undefined): boolean => {
  const value = header?.trim() ?? "";
  return value.length > 0 && value !== "*";
};

export { TEAPOT_STATUS_TEXT, MEDIA_TEA, TEXT_PLAIN, TEAPOT_ALLOW };
