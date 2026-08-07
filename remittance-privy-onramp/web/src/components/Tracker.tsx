import { Check, Clock3, Loader2 } from 'lucide-react';

export type TrackerStatus = 'complete' | 'active' | 'ready' | 'waiting' | 'failed';

export type TrackerStep = {
  title: string;
  body: string;
  status: TrackerStatus;
};

export function Tracker({ steps }: { steps: TrackerStep[] }) {
  return (
    <div className="tracker">
      {steps.map((step, index) => (
        <div className="tracker-row" key={step.title}>
          <div className="tracker-rail">
            <div className={`tracker-marker ${step.status}`}>
              {step.status === 'active' ? <Loader2 className="spinner" size={16} /> : null}
              {step.status === 'complete' ? <Check size={16} /> : null}
              {step.status === 'ready' ? <Clock3 size={16} /> : null}
              {step.status === 'failed' ? '!' : null}
            </div>
            {index < steps.length - 1 ? <div className="tracker-line" /> : null}
          </div>
          <div className="tracker-content">
            <div className="tracker-header">
              <h3>{step.title}</h3>
              <span className={`tracker-status ${step.status}`}>
                {step.status === 'complete'
                  ? 'Done'
                  : step.status === 'active'
                    ? 'In progress'
                    : step.status === 'ready'
                      ? 'Ready'
                      : step.status === 'failed'
                        ? 'Needs attention'
                        : 'Waiting'}
              </span>
            </div>
            <p>{step.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
