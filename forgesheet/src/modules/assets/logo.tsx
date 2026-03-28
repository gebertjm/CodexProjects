export const ForgeSheetLogo = () => (
  <svg viewBox="0 0 160 160" className="h-11 w-11" role="img" aria-label="ForgeSheet logo">
    <defs>
      <linearGradient id="forgeGradient" x1="0%" x2="100%" y1="0%" y2="100%">
        <stop offset="0%" stopColor="#f5efdf" />
        <stop offset="50%" stopColor="#d49a52" />
        <stop offset="100%" stopColor="#6e8ea0" />
      </linearGradient>
    </defs>
    <rect x="14" y="14" width="132" height="132" rx="28" fill="#17181d" stroke="rgba(245,239,223,0.25)" />
    <path d="M44 108L80 38L116 108H98L89 90H71L62 108H44Z" fill="url(#forgeGradient)" />
    <path d="M76 72H84L90 82H70L76 72Z" fill="#17181d" />
    <path d="M44 118H116" stroke="#94b3c8" strokeWidth="6" strokeLinecap="round" />
  </svg>
);
