const SITE_URL = "https://linked-in-optimization-hazel.vercel.app/";

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}#organization`,
    name: "LinkedUp",
    url: SITE_URL,
    logo: `${SITE_URL}/icon`,
    sameAs: [
      "https://piyushasayal.com",
      "https://linkedin.com/in/piyusha-sayal",
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}#website`,
    name: "LinkedUp",
    url: SITE_URL,
    inLanguage: "en",
    publisher: {
      "@id": `${SITE_URL}#organization`,
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${SITE_URL}#software`,
    name: "LinkedUp — AI LinkedIn Optimizer",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: `${SITE_URL}/optimize`,
    description:
      "AI LinkedIn optimizer that converts a resume into a stronger headline, About section, keyword plan, ATS-style score, and profile positioning.",
    creator: {
      "@id": `${SITE_URL}#organization`,
    },
  },
];

export default function StructuredData() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(structuredData),
      }}
    />
  );
}