import { useState, type ReactNode } from "react";

export interface Tip {
  title: string;
  body: ReactNode;
}

export function TipsCard({ tips }: { tips: Tip[] }) {
  const [step, setStep] = useState(0);
  const tip = tips[step];

  return (
    <div className="tips-card">
      <div className="tips-card-header">
        <span className="tips-card-label">
          Tip {step + 1} of {tips.length}
        </span>
        <div className="tips-card-dots">
          {tips.map((_, i) => (
            <span key={i} className={`tips-card-dot ${i === step ? "active" : ""}`} />
          ))}
        </div>
      </div>
      <h4>{tip.title}</h4>
      <div className="tips-card-body">{tip.body}</div>
      <div className="tips-card-nav">
        <button
          type="button"
          className="button-pill-outline"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          Back
        </button>
        <button
          type="button"
          className="button-pill-outline"
          disabled={step === tips.length - 1}
          onClick={() => setStep((s) => Math.min(tips.length - 1, s + 1))}
        >
          Next
        </button>
      </div>
    </div>
  );
}
