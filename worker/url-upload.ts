import { type Env, HttpError, readJson, fields, boundedBody } from "./shared";
import { uploadImage } from "./images";
function publicIP(ip: string): boolean {
  if (ip.includes(":"))
    return (
      /^[23][0-9a-f]{3}:/i.test(ip) && !/^2001:(?:0:|db8:|10:|20:)/i.test(ip)
    );
  const a = ip.split(".").map(Number);
  if (a.length !== 4 || a.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
    return false;
  return !(
    a[0] === 0 ||
    a[0] === 10 ||
    a[0] === 127 ||
    a[0]! >= 224 ||
    (a[0] === 169 && a[1] === 254) ||
    (a[0] === 172 && a[1]! >= 16 && a[1]! <= 31) ||
    (a[0] === 192 && a[1] === 168) ||
    (a[0] === 100 && a[1]! >= 64 && a[1]! <= 127) ||
    (a[0] === 198 && (a[1] === 18 || a[1] === 19)) ||
    (a[0] === 192 && a[1] === 0) ||
    (a[0] === 198 && a[1] === 51) ||
    (a[0] === 203 && a[1] === 0)
  );
}
export function validateRemoteURL(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(400, "Invalid image URL");
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443" && url.port !== "80") ||
    url.hostname.length > 253 ||
    !url.hostname.includes(".") ||
    /[\[\]:]/.test(url.hostname) ||
    /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) ||
    /\.(localhost|local|internal|home|test|invalid)$/i.test(url.hostname)
  )
    throw new HttpError(400, "Only public HTTP(S) image URLs are allowed");
  return url;
}
export async function uploadURL(request: Request, env: Env) {
  const body = await readJson(request);
  fields(body, ["url"]);
  if (typeof body.url !== "string" || body.url.length > 4096)
    throw new HttpError(400, "Invalid image URL");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    let url = validateRemoteURL(body.url),
      response: Response | undefined;
    for (let redirects = 0; redirects <= 3; redirects++) {
      // Validate all returned address records before every hop. Workers have no access to private bindings over fetch.
      const dns = await Promise.all(
        ["A", "AAAA"].map(async (type) => {
          const r = await fetch(
            `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(url.hostname)}&type=${type}`,
            {
              headers: { Accept: "application/dns-json" },
              signal: controller.signal,
            },
          );
          if (!r.ok) throw new HttpError(502, "Could not resolve image host");
          return (await r.json()) as {
            Answer?: { type: number; data: string }[];
          };
        }),
      );
      const addresses = dns
        .flatMap((d) => d.Answer || [])
        .filter((a) => a.type === 1 || a.type === 28);
      if (!addresses.length || addresses.some((a) => !publicIP(a.data)))
        throw new HttpError(400, "Only public HTTP(S) image URLs are allowed");
      response = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: "image/*" },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        if (redirects === 3 || !response.headers.get("location"))
          throw new HttpError(400, "Too many image redirects");
        url = validateRemoteURL(
          new URL(response.headers.get("location")!, url).href,
        );
        continue;
      }
      break;
    }
    if (!response?.ok || !response.body)
      throw new HttpError(502, "Could not fetch image URL");
    const blob = await boundedBody(
      new Request(request.url, {
        method: "POST",
        body: response.body,
        headers: response.headers,
        duplex: "half",
      } as RequestInit),
      20 * 1024 * 1024,
    );
    let name = "remote-image";
    try {
      name = decodeURIComponent(url.pathname.split("/").pop() || name);
    } catch {
      /* use fallback */
    }
    const form = new FormData();
    form.append(
      "file",
      new File([blob], name.slice(0, 200), {
        type: "application/octet-stream",
      }),
    );
    clearTimeout(timer);
    return await uploadImage(
      new Request(request.url, { method: "POST", body: form }),
      env,
    );
  } catch (error) {
    if (controller.signal.aborted)
      throw new HttpError(504, "Image URL request timed out");
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "Could not fetch image URL");
  } finally {
    clearTimeout(timer);
  }
}
