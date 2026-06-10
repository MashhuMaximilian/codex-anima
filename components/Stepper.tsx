'use client';

interface StepperProps {
  steps: string[];
  current: number; // 1-indexed
}

// 6-step wizard progress bar. Renders the existing .stepper pill row
// plus a per-step label row underneath so the user can see exactly
// which step they're on ("Settings" / "Identity" / etc.).
// The current step animates with a shimmer; completed steps are filled.
export function Stepper({ steps, current }: StepperProps) {
  return (
    <>
      <div className="stepper" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={current}>
        {steps.map((_, i) => {
          const stepNum = i + 1;
          const status =
            stepNum < current ? 'done' : stepNum === current ? 'current' : 'pending';
          return (
            <div
              key={i}
              className={`step-pill ${status === 'done' ? 'done' : ''} ${status === 'current' ? 'current' : ''}`}
            />
          );
        })}
      </div>
      <div className="stepper-labels">
        {steps.map((label, i) => {
          const stepNum = i + 1;
          const status =
            stepNum < current ? 'done' : stepNum === current ? 'current' : 'pending';
          return (
            <span
              key={i}
              className={`step-label-pill ${status === 'done' ? 'done' : ''} ${status === 'current' ? 'current' : ''}`}
            >
              {label}
            </span>
          );
        })}
      </div>
    </>
  );
}
