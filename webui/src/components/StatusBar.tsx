type StatusBarProps = {
  message: string;
};

export function StatusBar({ message }: StatusBarProps) {
  return (
    <footer className="statusbar">
      <span className="status-dot" aria-hidden="true"></span>
      <span className="status-text">{message}</span>
    </footer>
  );
}
