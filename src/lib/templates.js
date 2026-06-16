export const TEMPLATES = [
  {
    id: "classic", name: "Classic (serif)", layout: "single",
    fontFamily: 'Georgia, "Times New Roman", serif',
    headerAlign: "center", titleStyle: "underline",
    accent: "#1f4e5f",
    sizes: { name: 26, contact: 11, title: 12, body: 13, sub: 11 },
    sectionGap: 12,
  },
  {
    id: "modern", name: "Modern (sans)", layout: "single",
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    headerAlign: "left", titleStyle: "bar",
    accent: "#0f766e",
    sizes: { name: 28, contact: 11, title: 12, body: 13, sub: 11 },
    sectionGap: 14,
  },
  {
    id: "compact", name: "Compact", layout: "single",
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    headerAlign: "center", titleStyle: "rule",
    accent: "#334155",
    sizes: { name: 22, contact: 10, title: 11, body: 11.5, sub: 10 },
    sectionGap: 8,
  },
  {
    id: "sidebar", name: "Two-Column", layout: "twoColumn",
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    headerAlign: "left", titleStyle: "bar",
    accent: "#1f4e5f",
    sizes: { name: 26, contact: 10.5, title: 11.5, body: 12.5, sub: 10.5 },
    sectionGap: 12,
  },
];

export const getTemplate = (id) => TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];
