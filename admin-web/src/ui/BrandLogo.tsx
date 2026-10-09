import logo from '@/assets/brand/logo-mark.svg';

// The mark is a navy rounded tile; its corner radius is 232/1024 of its size (same as the mobile BrandLogo).
const TILE_RADIUS = 232 / 1024;

/** The PlugOrbit mark: a P with a charge bolt, circled by an orbit route. Same asset as the mobile app. */
export function BrandLogo({ size = 40, glow = false }: { size?: number; glow?: boolean }) {
  return (
    <span
      className="brand-tile"
      style={{ width: size, height: size, borderRadius: size * TILE_RADIUS, boxShadow: glow ? '0 0 18px rgba(162,240,103,0.45)' : undefined, display: 'inline-block' }}
    >
      <img src={logo} alt="PlugOrbit logo" width={size} height={size} />
    </span>
  );
}
