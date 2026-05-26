import { Check } from "lucide-react";

export interface Step {
  label: string;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: number; // 0-indexed
}

export function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center mb-10">
      {steps.map((step, i) => {
        const done = i < currentStep;
        const active = i === currentStep;

        return (
          <div key={step.label} className="flex items-center">
            <div className="flex items-center gap-2.5">
              {/* Circle */}
              <div
                className={[
                  "w-[30px] h-[30px] rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all duration-200",
                  done
                    ? "bg-[rgba(245,158,11,0.15)] border border-[rgba(245,158,11,0.4)] text-[#f59e0b]"
                    : active
                    ? "bg-brand-gradient border-0 text-white shadow-[0_0_16px_rgba(245,158,11,0.4)]"
                    : "bg-[#0d0d18] border border-white/[0.08] text-[#475569]",
                ].join(" ")}
              >
                {done ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>

              {/* Label */}
              <span
                className={[
                  "text-xs font-semibold whitespace-nowrap",
                  active ? "text-[#f1f5f9]" : "text-[#475569]",
                ].join(" ")}
              >
                {step.label}
              </span>
            </div>

            {/* Connector */}
            {i < steps.length - 1 && (
              <div
                className={[
                  "flex-1 h-px mx-3 min-w-[20px] transition-colors duration-200",
                  done
                    ? "bg-[rgba(245,158,11,0.3)]"
                    : "bg-white/[0.08]",
                ].join(" ")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
