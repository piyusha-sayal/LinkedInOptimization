import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LinkedUp — AI LinkedIn Optimizer",
    short_name: "LinkedUp",
    description:
      "AI LinkedIn optimizer that turns a resume into a stronger LinkedIn headline, About section, keyword plan, ATS-style score, and profile positioning.",
    start_url: "/",
    display: "standalone",
    background_color: "#010814",
    theme_color: "#54acbf",
    lang: "en",
    categories: ["business", "productivity", "career", "education"],
  };
}