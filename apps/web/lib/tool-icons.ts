import {
  PackageSearch,
  ImagePlus,
  Video,
  Sparkles,
  DollarSign,
  LayoutTemplate,
  FlaskConical,
  type LucideIcon,
} from "lucide-react";

// Mapa único nombre→icono para las tools (antes triplicado en ToolCard/AppShell/
// ComingSoon con fallbacks divergentes). Un icono nuevo en tools.ts se agrega acá.
const TOOL_ICONS: Record<string, LucideIcon> = {
  PackageSearch,
  ImagePlus,
  Video,
  Sparkles,
  DollarSign,
  LayoutTemplate,
  FlaskConical,
};

export function toolIcon(name: string): LucideIcon {
  return TOOL_ICONS[name] ?? Sparkles;
}
