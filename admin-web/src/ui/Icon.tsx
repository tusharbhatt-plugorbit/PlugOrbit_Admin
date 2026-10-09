import {
  Activity, ArrowLeft, ArrowUpRight, Ban, BadgeCheck, Banknote, BatteryCharging, Bell, Building2, Cable, CalendarClock, ChartColumn, Check, ChevronDown, ChevronLeft,
  ChevronRight, ChevronUp, CircleAlert, CircleCheck, CircleHelp, Clock, CloudOff, Copy, Cpu, Crosshair, Database, Download, ExternalLink, Eye, EyeOff, FileSearch, FileText,
  Flag, Gauge, GitMerge, Globe, Handshake, History, Hourglass, Inbox, Info, KeyRound, Layers, LayoutDashboard, LifeBuoy, Link, ListChecks, LocateFixed, Lock, LogOut, Mail,
  Map, MapPin, Megaphone, Menu, MessageSquare, Navigation, Pencil, Phone, Plug, Plus, Power, QrCode, Radio, Receipt, ReceiptText, RefreshCw, Rocket, Save, ScrollText,
  Search, Server, Settings, ShieldAlert, ShieldCheck, SlidersHorizontal, Smartphone, Sparkles, Star, Trash2, TrendingDown, TrendingUp, TriangleAlert, Undo2, User, UserCheck,
  Users, UserX, Wallet, Wifi, WifiOff, Wrench, X, Zap, type LucideIcon,
} from 'lucide-react';

/** The mobile app draws its icons from Lucide (stroke 2, round caps); the admin uses the same set. */
const ICONS = {
  activity: Activity, 'arrow-left': ArrowLeft, 'arrow-up-right': ArrowUpRight, ban: Ban, 'badge-check': BadgeCheck, banknote: Banknote, battery: BatteryCharging, bell: Bell,
  building: Building2, cable: Cable, calendar: CalendarClock, chart: ChartColumn, check: Check, 'chevron-down': ChevronDown, 'chevron-left': ChevronLeft, 'chevron-right': ChevronRight,
  'chevron-up': ChevronUp, 'circle-alert': CircleAlert, 'circle-check': CircleCheck, help: CircleHelp, clock: Clock, 'cloud-off': CloudOff, copy: Copy, cpu: Cpu, crosshair: Crosshair,
  database: Database, download: Download, external: ExternalLink, eye: Eye, 'eye-off': EyeOff, 'file-search': FileSearch, file: FileText, flag: Flag, gauge: Gauge, merge: GitMerge,
  globe: Globe, handshake: Handshake, history: History, hourglass: Hourglass, inbox: Inbox, info: Info, key: KeyRound, layers: Layers, dashboard: LayoutDashboard, lifebuoy: LifeBuoy,
  link: Link, checklist: ListChecks, locate: LocateFixed, lock: Lock, logout: LogOut, mail: Mail, map: Map, 'map-pin': MapPin, megaphone: Megaphone, menu: Menu, message: MessageSquare,
  navigation: Navigation, pencil: Pencil, phone: Phone, plug: Plug, plus: Plus, power: Power, qr: QrCode, radio: Radio, receipt: Receipt, 'receipt-text': ReceiptText, refresh: RefreshCw,
  rocket: Rocket, save: Save, scroll: ScrollText, search: Search, server: Server, settings: Settings, 'shield-alert': ShieldAlert, shield: ShieldCheck, sliders: SlidersHorizontal,
  phone2: Smartphone, sparkles: Sparkles, star: Star, trash: Trash2, 'trend-down': TrendingDown, 'trend-up': TrendingUp, alert: TriangleAlert, undo: Undo2, user: User,
  'user-check': UserCheck, users: Users, 'user-x': UserX, wallet: Wallet, wifi: Wifi, 'wifi-off': WifiOff, wrench: Wrench, x: X, zap: Zap,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18, color, filled = false, strokeWidth = 2, className }: {
  name: IconName; size?: number; color?: string; filled?: boolean; strokeWidth?: number; className?: string;
}) {
  const Cmp = ICONS[name];
  return <Cmp size={size} color={color} strokeWidth={strokeWidth} fill={filled ? 'currentColor' : 'none'} className={className} aria-hidden="true" />;
}
