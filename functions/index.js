const GREEN_TARGET_HOST = "greentarget.tienhock.com";
const GREEN_TARGET_URL = `https://${GREEN_TARGET_HOST}/`;
const GREEN_TARGET_TITLE = "Green Target Customer Registration";
const GREEN_TARGET_DESCRIPTION =
  "Register your details, service locations and payment method with Green Target Waste Treatment.";
const GREEN_TARGET_IMAGE = `${GREEN_TARGET_URL}greentarget-logo.png`;

const GREEN_TARGET_META_TAGS = [
  '<meta name="application-name" content="Green Target Customer Registration">',
  '<meta property="og:type" content="website">',
  `<meta property="og:url" content="${GREEN_TARGET_URL}">`,
  `<meta property="og:site_name" content="Green Target Waste Treatment">`,
  `<meta property="og:title" content="${GREEN_TARGET_TITLE}">`,
  `<meta property="og:description" content="${GREEN_TARGET_DESCRIPTION}">`,
  `<meta property="og:image" content="${GREEN_TARGET_IMAGE}">`,
  '<meta property="og:image:type" content="image/png">',
  '<meta property="og:image:width" content="1563">',
  '<meta property="og:image:height" content="1563">',
  '<meta property="og:image:alt" content="Green Target Waste Treatment logo">',
  '<meta name="twitter:card" content="summary">',
  `<meta name="twitter:title" content="${GREEN_TARGET_TITLE}">`,
  `<meta name="twitter:description" content="${GREEN_TARGET_DESCRIPTION}">`,
  `<meta name="twitter:image" content="${GREEN_TARGET_IMAGE}">`,
  `<link rel="canonical" href="${GREEN_TARGET_URL}">`,
].join("");

/**
 * @typedef {{
 *   setInnerContent: (content: string) => void,
 *   setAttribute: (name: string, value: string) => void,
 *   append: (content: string, options?: { html?: boolean }) => void
 * }} RewriterElement
 */

/**
 * @param {string} content
 * @returns {{ element: (element: RewriterElement) => void }}
 */
const replaceText = (content) => ({
  element(element) {
    element.setInnerContent(content);
  },
});

/**
 * @param {string} attribute
 * @param {string} value
 * @returns {{ element: (element: RewriterElement) => void }}
 */
const replaceAttribute = (attribute, value) => ({
  element(element) {
    element.setAttribute(attribute, value);
  },
});

const appendGreenTargetMeta = {
  /** @param {RewriterElement} element */
  element(element) {
    element.append(GREEN_TARGET_META_TAGS, { html: true });
  },
};

/**
 * Cloudflare Pages root-route function. The shared Pages project keeps the
 * normal Tien Hock HTML on every other hostname and rewrites only Green Target.
 *
 * @param {{ request: Request, next: () => Promise<Response> }} context
 * @returns {Promise<Response>}
 */
export async function onRequest(context) {
  const hostname = new URL(context.request.url).hostname.toLowerCase();
  if (hostname !== GREEN_TARGET_HOST) {
    return context.next();
  }

  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    return response;
  }

  return new HTMLRewriter()
    .on("title", replaceText(GREEN_TARGET_TITLE))
    .on(
      'meta[name="description"]',
      replaceAttribute("content", GREEN_TARGET_DESCRIPTION)
    )
    .on('meta[name="theme-color"]', replaceAttribute("content", "#047857"))
    .on('link[rel="icon"]', replaceAttribute("href", "/greentarget-logo.png"))
    .on(
      'link[rel="apple-touch-icon"]',
      replaceAttribute("href", "/greentarget-logo.png")
    )
    .on(
      'link[rel="manifest"]',
      replaceAttribute("href", "/greentarget-manifest.json")
    )
    .on("head", appendGreenTargetMeta)
    .transform(response);
}
