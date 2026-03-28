export function Badge({ children, variant = 'default' }: { children: React.ReactNode; variant?: string }) {
  const variants: Record<string, string> = {
    default: 'bg-purple-600/20 border border-purple-500/50 text-purple-300',
    success: 'bg-green-600/20 border border-green-500/50 text-green-300',
    error: 'bg-red-600/20 border border-red-500/50 text-red-300',
    warning: 'bg-yellow-600/20 border border-yellow-500/50 text-yellow-300',
    info: 'bg-blue-600/20 border border-blue-500/50 text-blue-300',
  };

  return (
    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${variants[variant] || variants.default}`}>
      {children}
    </span>
  );
}
