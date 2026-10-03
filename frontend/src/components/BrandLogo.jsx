import logo from '../assets/branding/ewa_logo_wide_sticker.png';

export function BrandLogo({ compact = false, className = '' }) {
  return (
    <span className={`inline-flex items-center ${className}`} aria-label="EWAGuard AI">
      <img
        src={logo}
        alt="EWAGuard AI"
        className={compact ? 'h-10 w-auto max-w-40 object-contain' : 'h-12 w-auto max-w-52 object-contain'}
      />
    </span>
  );
}
