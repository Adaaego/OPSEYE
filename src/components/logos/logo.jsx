
export function LogoMark({ className = 'h-9 w-9' }) {
    return (
      <svg
        viewBox="0 0 48 48"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Outer ring */}
        <circle cx="24" cy="24" r="22" stroke="url(#gold-grad)" strokeWidth="1.5" opacity="0.35" />
        {/* Middle ring */}
        <circle cx="24" cy="24" r="15" stroke="url(#gold-grad)" strokeWidth="1.5" opacity="0.6" />
        {/* Inner ring */}
        <circle cx="24" cy="24" r="8" stroke="url(#gold-grad)" strokeWidth="1.5" />
        {/* Center dot */}
        <circle cx="24" cy="24" r="2.5" fill="#d4b06a" />
        {/* Sweep line */}
        <path d="M24 24 L24 2" stroke="url(#gold-grad)" strokeWidth="1.5" strokeLinecap="round" />
        {/* Crosshair ticks */}
        <path d="M24 2 L24 5 M24 43 L24 46 M2 24 L5 24 M43 24 L46 24" stroke="url(#gold-grad)" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
        <defs>
          <linearGradient id="gold-grad" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
            <stop stopColor="#e9d29b" />
            <stop offset="1" stopColor="#b3862f" />
          </linearGradient>
        </defs>
      </svg>
    );
  }
  
  export function Logo({ className, showText = true }) {
    return (
      <div className={`flex items-center gap-3 ${className ?? ''}`}>
        <LogoMark className="h-9 w-9" />
        {showText && (
          <span className="text-white font-semibold tracking-tight text-xl leading-none">
            OPSEYE
          </span>
        )}
      </div>
    );
  }