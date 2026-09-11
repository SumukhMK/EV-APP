import type { SvgIconComponent } from '@mui/icons-material';
import type { UserRole } from '../types';
import SpeedIcon from '@mui/icons-material/SpeedOutlined';
import TodayIcon from '@mui/icons-material/TodayOutlined';
import TwoWheelerIcon from '@mui/icons-material/TwoWheelerOutlined';
import BuildIcon from '@mui/icons-material/BuildOutlined';
import HandymanIcon from '@mui/icons-material/HandymanOutlined';
import FactCheckIcon from '@mui/icons-material/FactCheckOutlined';
import PeopleIcon from '@mui/icons-material/PeopleOutlineOutlined';
import PersonAddIcon from '@mui/icons-material/PersonAddAltOutlined';
import LinkIcon from '@mui/icons-material/AddLinkOutlined';
import SwapIcon from '@mui/icons-material/SwapHorizOutlined';
import LogoutIcon from '@mui/icons-material/AssignmentReturnedOutlined';
import ReceiptIcon from '@mui/icons-material/ReceiptLongOutlined';
import WarningIcon from '@mui/icons-material/ErrorOutlineOutlined';
import RecoveryIcon from '@mui/icons-material/ReplayCircleFilledOutlined';
import AdminIcon from '@mui/icons-material/ManageAccountsOutlined';
import HistoryIcon from '@mui/icons-material/HistoryOutlined';

/**
 * Single source of truth for navigation. The router builds from the same
 * paths, so a screen cannot exist without a way to reach it, and a nav item
 * cannot point at a route that was never built.
 *
 * `owner` records who is building the screen — SMK has the shell, the
 * dashboard and the vehicle flow; Abhiram has the rider flow. Anything marked
 * `unassigned` still needs a name against it.
 */
export type ScreenOwner = 'smk' | 'abhiram' | 'unassigned';

export interface NavItem {
  label: string;
  path: string;
  icon: SvgIconComponent;
  owner: ScreenOwner;
  /**
   * Artboard number in the signed-off wireframe. Absent for the few screens
   * that were never drawn — tooling, not product.
   */
  artboard?: number;
}

export interface NavSection {
  heading: string;
  items: NavItem[];
  /**
   * Which roles see this section. The rail hides a section a role has no
   * business in — a service manager never sees Money, a fleet hand never sees
   * Admin — so nobody scans past screens they cannot use. This mirrors the
   * server-side rules that will gate the same routes for real once auth lands;
   * it is a convenience here, not a control.
   */
  roles: UserRole[];
}

const ALL_ROLES: UserRole[] = ['SUPER_ADMIN', 'TENANT_ADMIN', 'FLEET_STAFF', 'SERVICE_MANAGER'];

export const NAV: NavSection[] = [
  {
    heading: 'Operations',
    roles: ALL_ROLES,
    items: [
      { label: "Today's operations", path: '/operations/today', icon: TodayIcon, owner: 'smk', artboard: 21 },
    ],
  },
  {
    heading: 'Fleet',
    roles: ALL_ROLES,
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: SpeedIcon, owner: 'smk', artboard: 2 },
      { label: 'Vehicles', path: '/vehicles', icon: TwoWheelerIcon, owner: 'smk', artboard: 3 },
      { label: 'Inspection', path: '/inspections', icon: BuildIcon, owner: 'smk', artboard: 13 },
      { label: 'Service queues', path: '/service', icon: HandymanIcon, owner: 'smk', artboard: 22 },
      { label: 'QC queue', path: '/qc', icon: FactCheckIcon, owner: 'smk', artboard: 14 },
    ],
  },
  {
    heading: 'Riders',
    // The workshop role (service manager) works bikes, not riders.
    roles: ['SUPER_ADMIN', 'TENANT_ADMIN', 'FLEET_STAFF'],
    items: [
      { label: 'Riders', path: '/riders', icon: PeopleIcon, owner: 'abhiram', artboard: 7 },
      { label: 'Onboard rider', path: '/riders/onboard', icon: PersonAddIcon, owner: 'abhiram', artboard: 9 },
      { label: 'Assign vehicle', path: '/assignments/assign', icon: LinkIcon, owner: 'abhiram', artboard: 10 },
      { label: 'Exchange vehicle', path: '/assignments/exchange', icon: SwapIcon, owner: 'abhiram', artboard: 11 },
      { label: 'Deboard rider', path: '/assignments/deboard', icon: LogoutIcon, owner: 'abhiram', artboard: 12 },
    ],
  },
  {
    heading: 'Money',
    // Money is an admin responsibility; staff and workshop never touch it.
    roles: ['SUPER_ADMIN', 'TENANT_ADMIN'],
    items: [
      { label: 'Weekly payment run', path: '/payments/run', icon: ReceiptIcon, owner: 'smk', artboard: 15 },
      { label: 'Overdue riders', path: '/payments/overdue', icon: WarningIcon, owner: 'smk', artboard: 17 },
      { label: 'Recovery', path: '/recovery', icon: RecoveryIcon, owner: 'smk', artboard: 23 },
    ],
  },
  {
    heading: 'Admin',
    roles: ['SUPER_ADMIN', 'TENANT_ADMIN'],
    items: [
      { label: 'Users & roles', path: '/users', icon: AdminIcon, owner: 'smk', artboard: 18 },
      { label: 'Audit log', path: '/audit', icon: HistoryIcon, owner: 'smk', artboard: 19 },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV.flatMap((s) => s.items);

/** The sections a role is allowed to see, in rail order. */
export function navForRole(role: UserRole): NavSection[] {
  return NAV.filter((section) => section.roles.includes(role));
}
