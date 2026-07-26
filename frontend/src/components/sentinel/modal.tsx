export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="animate-fade-in fixed inset-0 z-50 grid place-items-center p-4">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-[#1a1e2e]/20 backdrop-blur-[10px]"
      />
      <div className="glass-strong relative w-full max-w-md rounded-[20px] p-6 shadow-modal">
        <h3 className="text-[15px] font-normal">{title}</h3>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function GhostBtn({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="btn-pill btn-secondary">
      {children}
    </button>
  );
}
