import type { MetadataRoute } from "next";

const SITE_URL = "https://linked-in-optimization-hazel.vercel.app/";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/optimize"],
        disallow: ["/dashboard", "/sign-in", "/sign-up", "/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}