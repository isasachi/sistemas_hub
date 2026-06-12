import { ComingSoon } from "@/components/tools/ComingSoon";
import { getToolBySlug } from "@/lib/tools";

export default function CalculadoraCostos() {
  const tool = getToolBySlug("calculadora-costos")!;
  return <ComingSoon tool={tool} />;
}
