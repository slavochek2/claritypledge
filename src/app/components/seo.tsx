import { Helmet } from "react-helmet-async";
import { useEffect } from "react";
import { SAME_AS_URLS } from "./layout/social-links";

interface SEOProps {
  title?: string;
  description?: string;
  url?: string;
  image?: string;
  type?: "website" | "profile" | "article";
  noIndex?: boolean;
  // For profile pages
  profile?: {
    name: string;
    role?: string;
    signedAt?: string;
  };
  // For article pages
  article?: {
    headline: string;
    author: string;
    authorUrl?: string;
    datePublished: string;
    dateModified?: string;
  };
}

const DEFAULT_TITLE = "Clarity Pledge - Commit to Clear Communication";
const DEFAULT_DESCRIPTION =
  "Reveal and bridge the understanding gap with your business partner, before it costs you the partnership.";
const DEFAULT_IMAGE = "https://claritypledge.com/clarity-pledge-icon.png";
const BASE_URL = "https://claritypledge.com";

// Organization schema - used on all pages
const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Clarity Pledge",
  url: BASE_URL,
  logo: DEFAULT_IMAGE,
  description:
    "Help you and your business partner reveal and bridge the gaps in how well you understand each other.",
  // Entity-linking: tells search engines these external profiles are the same
  // organization. Single source of truth in layout/social-links.ts.
  sameAs: SAME_AS_URLS,
};

// ── Direct meta tag helpers (React 19 / react-helmet-async compatibility) ──────
//
// react-helmet-async v2 does not update <meta property="..."> tags in React 19
// because React 19 extracts <meta> elements from the render tree before Helmet
// can process them as children. We bypass this by using direct DOM manipulation
// via useEffect for all <meta> tags. <title> is still handled by Helmet because
// React 19 supports native title deduplication.
//
// The SAME extraction applies to <link>, which is why setCanonical exists below. The
// canonical URL used to be rendered as <link rel="canonical"> inside <Helmet> and
// therefore never reached the DOM at all: the only canonical on the page was the
// static one in index.html, so EVERY route told crawlers its real address was
// "https://claritypledge.com/" — /coach, /founder, /manifesto and the rest could
// not rank independently. Keep canonical on this imperative path, not in <Helmet>.

function setMeta(attr: "name" | "property", key: string, value: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    el.setAttribute("data-rh", "true");
    document.head.appendChild(el);
  }
  el.setAttribute("content", value);
}

function removeMeta(attr: "name" | "property", key: string) {
  const el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"][data-rh="true"]`);
  if (el) el.remove();
}

// Updates the existing <link rel="canonical"> in place when index.html already ships
// one (it does — that static tag is the correct pre-hydration default for crawlers),
// otherwise creates it. Never appends a second: two canonicals are worse than a wrong
// one, because crawlers discard both.
function setCanonical(href: string) {
  let el = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    el.setAttribute("data-rh", "true");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export function SEO({
  title,
  description = DEFAULT_DESCRIPTION,
  url,
  image = DEFAULT_IMAGE,
  type = "website",
  noIndex = false,
  profile,
  article,
}: SEOProps) {
  // Build longer, more descriptive titles for better SEO (optimal: 50-60 chars)
  let fullTitle: string;
  if (title) {
    // For profile pages, make title more descriptive
    if (profile) {
      fullTitle = `${title}'s Clarity Pledge - Public Commitment to Clear Communication`;
    } else {
      fullTitle = `${title} | Clarity Pledge`;
    }
  } else {
    fullTitle = DEFAULT_TITLE;
  }

  const fullUrl = url ? `${BASE_URL}${url}` : BASE_URL;

  // Build JSON-LD structured data
  const jsonLdSchemas: object[] = [organizationSchema];

  // Add ProfilePage schema for profile pages
  if (profile) {
    const profileSchema = {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      mainEntity: {
        "@type": "Person",
        name: profile.name,
        ...(profile.role && { jobTitle: profile.role }),
        url: fullUrl,
      },
      dateCreated: profile.signedAt,
      description: description,
    };
    jsonLdSchemas.push(profileSchema);
  }

  // Add Article schema for article pages
  if (article) {
    // Ensure dates have timezone for Google Rich Results
    const formatDateWithTimezone = (date: string) => {
      // If already has time component, return as is
      if (date.includes("T")) return date;
      // Add midnight UTC timezone
      return `${date}T00:00:00Z`;
    };

    const articleSchema = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: article.headline,
      author: {
        "@type": "Person",
        name: article.author,
        ...(article.authorUrl && { url: article.authorUrl }),
      },
      publisher: organizationSchema,
      datePublished: formatDateWithTimezone(article.datePublished),
      ...(article.dateModified && { dateModified: formatDateWithTimezone(article.dateModified) }),
      description: description,
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": fullUrl,
      },
      image: image,
    };
    jsonLdSchemas.push(articleSchema);
  }

  // Add WebSite schema for homepage
  if (url === "/" || !url) {
    const webSiteSchema = {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Clarity Pledge",
      url: BASE_URL,
      description: DEFAULT_DESCRIPTION,
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${BASE_URL}/pledgers?search={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    };
    jsonLdSchemas.push(webSiteSchema);
  }

  const imageWidth = image?.includes('/banners/') ? "1200" : "512";
  const imageHeight = image?.includes('/banners/') ? "630" : "512";

  // Apply meta tags directly to avoid react-helmet-async / React 19 incompatibility.
  // React 19 extracts <meta> children from the Helmet render tree, so Helmet never
  // gets to call updateTags() for them. Direct DOM manipulation is the reliable path.
  useEffect(() => {
    // name-based meta
    setMeta("name", "title", fullTitle);
    setMeta("name", "description", description);

    // Open Graph
    setMeta("property", "og:type", type);
    setMeta("property", "og:url", fullUrl);
    setMeta("property", "og:title", fullTitle);
    setMeta("property", "og:description", description);
    setMeta("property", "og:image", image ?? DEFAULT_IMAGE);
    setMeta("property", "og:image:width", imageWidth);
    setMeta("property", "og:image:height", imageHeight);
    setMeta("property", "og:site_name", "Clarity Pledge");

    // Twitter
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:url", fullUrl);
    setMeta("name", "twitter:title", fullTitle);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", image ?? DEFAULT_IMAGE);

    if (noIndex) {
      setMeta("name", "robots", "noindex, nofollow");
    } else {
      removeMeta("name", "robots");
    }

    // Canonical — imperative for the same React 19 reason as the meta tags above.
    setCanonical(fullUrl);

    return () => {
      // On unmount, remove dynamically added meta tags so stale tags don't linger
      // after SPA navigation. Only remove tags we added (data-rh="true").
      removeMeta("name", "title");
      removeMeta("name", "description");
      removeMeta("property", "og:type");
      removeMeta("property", "og:url");
      removeMeta("property", "og:title");
      removeMeta("property", "og:description");
      removeMeta("property", "og:image");
      removeMeta("property", "og:image:width");
      removeMeta("property", "og:image:height");
      removeMeta("property", "og:site_name");
      removeMeta("name", "twitter:card");
      removeMeta("name", "twitter:url");
      removeMeta("name", "twitter:title");
      removeMeta("name", "twitter:description");
      removeMeta("name", "twitter:image");
      // Canonical is NOT removed — it is reset to the site root, matching the static
      // default index.html ships. A route without its own <SEO> then degrades to the
      // site root rather than inheriting the previous route's URL, and crawlers never
      // see a page with no canonical at all.
      setCanonical(BASE_URL);
    };
  }, [fullTitle, description, type, fullUrl, image, imageWidth, imageHeight, noIndex]);

  return (
    <Helmet>
      {/* <title> is handled by Helmet — React 19 natively dedupes title to <head> */}
      <title>{fullTitle}</title>
      {/* NO <link rel="canonical"> here — React 19 extracts <link> from the render tree
          before Helmet sees it, so it silently never rendered. Set via setCanonical() in
          the effect above. Do not "restore" it here; it is dead code that looks correct. */}

      {/* Robots (static pages only — dynamic noIndex handled via useEffect) */}
      {!noIndex && <meta name="robots" content="index, follow" />}

      {/* JSON-LD Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify(jsonLdSchemas.length === 1 ? jsonLdSchemas[0] : jsonLdSchemas)}
      </script>
    </Helmet>
  );
}
