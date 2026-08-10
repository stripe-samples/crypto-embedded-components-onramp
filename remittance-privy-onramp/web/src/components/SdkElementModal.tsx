import { useCallback } from 'react';

export function SdkElementModal({
  element,
  title,
  onClose,
}: {
  element: HTMLElement | null;
  title: string;
  onClose: () => void;
}) {
  const containerRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (node && element && !node.contains(element)) {
        node.innerHTML = '';
        node.appendChild(element);
      }
    },
    [element],
  );

  if (!element) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="sdk-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div ref={containerRef} className="sdk-modal-content" />
      </div>
    </div>
  );
}
