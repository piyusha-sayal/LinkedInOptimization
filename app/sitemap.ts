import type { MetadataRoute } from "next";

const SITE_URL = "https://linked-in-optimization-hazel.vercel.app/";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/optimize`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
  ];
}