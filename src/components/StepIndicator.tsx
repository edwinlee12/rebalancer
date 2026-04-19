'use client';

import type { WizardStep } from '@/lib/store';

const STEPS: { key: WizardStep; label: string; number: number }[] = [
  { key: 'targets', label: 'Portfolio & Targets', number: 1 },
  { key: 'recommendations', label: 'Recommendations', number: 2 },
  { key: 'trades', label: 'Trade List', number: 3 },
];

export function StepIndicator({
  current,
  onStepClick,
}: {
  current: WizardStep;
  onStepClick?: (step: WizardStep) => void;
}) {
  const currentIndex = STEPS.findIndex((s) => s.key === current);

  return (
    <div className="flex items-center gap-2 sm:gap-4">
      {STEPS.map((step, i) => {
        const isActive = step.key === current;
        const isCompleted = i < currentIndex;
        const isClickable = onStepClick && (isCompleted || isActive);

        return (
          <div key={step.key} className="flex items-center gap-2 sm:gap-4">
            {i > 0 && (
              <div
                className={`h-px w-4 sm:w-8 ${
                  i <= currentIndex ? 'bg-accent' : 'bg-border'
                }`}
              />
            )}
            <button
              onClick={() => isClickable && onStepClick?.(step.key)}
              disabled={!isClickable}
              className={`flex items-center gap-2 text-sm font-body transition-colors ${
                isActive
                  ? 'text-accent font-semibold'
                  : isCompleted
                    ? 'text-accent cursor-pointer'
                    : 'text-text-muted cursor-default'
              }`}
            >
              <span
                className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold border ${
                  isActive
                    ? 'bg-accent text-white border-accent'
                    : isCompleted
                      ? 'bg-accent-light text-accent border-accent'
                      : 'bg-surface text-text-muted border-border'
                }`}
              >
                {isCompleted ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  step.number
                )}
              </span>
              <span className="hidden sm:inline">{step.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
