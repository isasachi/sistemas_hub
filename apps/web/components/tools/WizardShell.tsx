"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { StepIndicator, type Step } from "./StepIndicator";

interface WizardShellProps {
  steps: Step[];
  preview: React.ReactNode;
  children: (props: {
    currentStep: number;
    goNext: () => void;
    goPrev: () => void;
    isFirst: boolean;
    isLast: boolean;
  }) => React.ReactNode;
  toolName: string;
}

export function WizardShell({
  steps,
  preview,
  children,
  toolName,
}: WizardShellProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;

  const goNext = () => setCurrentStep((s) => Math.min(s + 1, steps.length - 1));
  const goPrev = () => setCurrentStep((s) => Math.max(s - 1, 0));

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a]">
      {/* Breadcrumb */}
      <div className="px-8 py-3.5 border-b border-white/[0.06] flex items-center gap-2 text-[13px]">
        <Link href="/" className="text-[#8a8a8a] hover:text-[#bdbdbd] transition-colors no-underline">
          Herramientas
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-[#8a8a8a]" />
        <span className="text-[#f5f5f5] font-semibold">{toolName}</span>
      </div>

      {/* Split layout */}
      <div className="flex flex-1 min-h-0">
        {/* Wizard panel */}
        <div className="flex-1 px-12 py-10 border-r border-white/[0.06] overflow-y-auto">
          <StepIndicator steps={steps} currentStep={currentStep} />

          {children({ currentStep, goNext, goPrev, isFirst, isLast })}

          {/* Navigation buttons */}
          <div className="flex items-center justify-between mt-9 pt-6 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={goPrev}
              disabled={isFirst}
              className={[
                "flex items-center gap-1.5 border border-white/[0.06] rounded-xl px-5 py-2.5 text-[14px] font-medium font-sans transition-all duration-200",
                isFirst
                  ? "opacity-0 pointer-events-none"
                  : "text-[#bdbdbd] hover:text-[#f5f5f5] hover:border-white/[0.18] cursor-pointer",
              ].join(" ")}
            >
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </button>

            {!isLast ? (
              <button
                type="button"
                onClick={goNext}
                className="flex items-center gap-2 jr-cta text-[14px] font-bold px-7 py-2.5 rounded-xl transition-all duration-200 cursor-pointer border-0 font-sans"
              >
                Siguiente
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                className="flex items-center gap-2 jr-cta text-[14px] font-bold px-7 py-2.5 rounded-xl transition-all duration-200 cursor-pointer border-0 font-sans"
              >
                Generar ahora ✦
              </button>
            )}
          </div>
        </div>

        {/* Preview panel */}
        <div className="w-[420px] flex-shrink-0 sticky top-0 h-screen overflow-y-auto">
          {preview}
        </div>
      </div>
    </div>
  );
}
