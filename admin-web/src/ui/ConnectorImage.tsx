import type { ConnectorType } from '@/api/types';
import { colors } from '@/design/tokens';

// A front-on picture of the plug's face, so an admin (and a driver) can match it to the socket.
// Ported 1:1 from the mobile app's ConnectorImage so both products draw connectors identically.
const HOUSING = '#1E293B';
type Dot = readonly [number, number, number];

const TYPE2_SHELL = 'M15.4 16 H48.6 A26 26 0 1 1 15.4 16 Z';
const TYPE2_PINS: readonly Dot[] = [[25, 24, 2.4], [39, 24, 2.4], [20, 36, 4], [32, 36, 4], [44, 36, 4], [26, 48, 4], [38, 48, 4]];
const CCS2_SHELL = 'M16.9 11 H47.1 A22 22 0 1 1 16.9 11 Z';
const CCS2_PINS: readonly Dot[] = [[26, 18, 2], [38, 18, 2], [22, 27, 3], [32, 27, 3], [42, 27, 3], [27, 36, 3], [37, 36, 3], [22, 49, 5.2], [42, 49, 5.2]];
const ROUND_SHELL = 'M32 5 A27 27 0 1 1 31.99 5 Z';
const CHADEMO_PINS: readonly Dot[] = [[21, 40, 6.5], [43, 40, 6.5], [20, 21, 2.4], [32, 17, 2.4], [44, 21, 2.4], [27, 29, 2.4], [37, 29, 2.4]];
const GBT_PINS: readonly Dot[] = [[21, 38, 6], [43, 38, 6], [22, 19, 2.4], [42, 19, 2.4], [28, 28, 2.4], [36, 28, 2.4], [32, 52, 2.4]];

const Pins = ({ dots, fill }: { dots: readonly Dot[]; fill: string }) => (
  <>{dots.map(([cx, cy, r]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={fill} />)}</>
);

export function ConnectorImage({ type, size = 56, selected = false }: { type: ConnectorType; size?: number; selected?: boolean }) {
  const pin = selected ? colors.lime : colors.divider;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ flex: 'none' }} role="img" aria-label={`${type} connector`}>
      {type === 'Type2' && (<><path d={TYPE2_SHELL} fill={HOUSING} /><Pins dots={TYPE2_PINS} fill={pin} /></>)}
      {(type === 'CCS2' || type === 'LECCS') && (<><path d={CCS2_SHELL} fill={HOUSING} /><rect x="9" y="38" width="46" height="21" rx="10" fill={HOUSING} /><Pins dots={CCS2_PINS} fill={pin} /></>)}
      {type === 'CHAdeMO' && (<><path d={ROUND_SHELL} fill={HOUSING} /><Pins dots={CHADEMO_PINS} fill={pin} /></>)}
      {type === 'GBT' && (<><path d={ROUND_SHELL} fill={HOUSING} /><rect x="28" y="3" width="8" height="7" rx="2" fill={HOUSING} /><Pins dots={GBT_PINS} fill={pin} /></>)}
    </svg>
  );
}
