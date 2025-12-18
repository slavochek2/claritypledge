import { Helmet } from "react-helmet-async";

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
    datePublished: string;
    dateModified?: string;
  };
}

const DEFAULT_TITLE = "Clarity Pledge - Commit to Clear Communication";
const DEFAULT_DESCRIPTION =
  "Join professionals worldwide in a public commitment to clear, honest communication. Sign the pledge and get your shareable certificate.";
const DEFAULT_IMAGE = "https://claritypledge.com/clarity-pledge-icon.png";
const BASE_URL = "https://claritypledge.com";

// Organization schema - used on all pages
const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Clarity Pledge",
  url: BASE_URL,
  logo: DEFAULT_IMAGE,
  description: "A public commitment to clear, honest communication",
  sameAs: [
    "https://www.linkedin.com/company/claritypledge",
  ],
};

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
    const articleSchema = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: article.headline,
      author: {
        "@type": "Person",
        name: article.author,
      },
      publisher: organizationSchema,
      datePublished: article.datePublished,
      ...(article.dateModified && { dateModified: article.dateModified }),
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
          urlTemplate: `${BASE_URL}/clarity-champions?search={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    };
    jsonLdSchemas.push(webSiteSchema);
  }

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="title" content={fullTitle} />
      <meta name="description" content={description} />
      <link rel="canonical" href={fullUrl} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={fullUrl} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:image:width" content="512" />
      <meta property="og:image:height" content="512" />
      <meta property="og:site_name" content="Clarity Pledge" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={fullUrl} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {/* Robots */}
      {noIndex && <meta name="robots" content="noindex, nofollow" />}

      {/* JSON-LD Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify(jsonLdSchemas.length === 1 ? jsonLdSchemas[0] : jsonLdSchemas)}
      </script>
    </Helmet>
  );
}
