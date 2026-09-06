export function Logo({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center justify-center rounded-[22%] bg-neutral-900 font-bold text-white ${className}`} aria-hidden>
      <span className="text-[62%] leading-none">K</span>
    </span>
  );
}
