import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Хот тохижилтын ERP",
    short_name: "Хот ERP",
    description: "Хот тохижилт, хог тээвэр, засвар, HR ажлын PWA систем",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7faf7",
    theme_color: "#2e7d32",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
