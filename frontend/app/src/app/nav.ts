import type { SvgIconComponent } from '@mui/icons-material';
import SpeedIcon from '@mui/icons-material/SpeedOutlined';
import TwoWheelerIcon from '@mui/icons-material/TwoWheelerOutlined';
import BuildIcon from '@mui/icons-material/BuildOutlined';
import FactCheckIcon from '@mui/icons-material/FactCheckOutlined';
import PeopleIcon from '@mui/icons-material/PeopleOutlineOutlined';
import PersonAddIcon from '@mui/icons-material/PersonAddAltOutlined';
import LinkIcon from '@mui/icons-material/AddLinkOutlined';
import SwapIcon from '@mui/icons-material/SwapHorizOutlined';
import LogoutIcon from '@mui/icons-material/AssignmentReturnedOutlined';
import ReceiptIcon from '@mui/icons-material/ReceiptLongOutlined';
import WarningIcon from '@mui/icons-material/ErrorOutlineOutlined';
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
  /** Artboard number in the signed-off wireframe. */
  artboard: number;
}

export interface NavSection {
  heading: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    heading: 'Fleet',
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: SpeedIcon, owner: 'smk', artboard: 2 },
      { label: 'Vehicles', path: '/vehicles', icon: TwoWheelerIcon, owner: 'smk', artboard: 3 },
      { label: 'Inspection', path: '/inspections', icon: BuildIcon, owner: 'smk', artboard: 13 },
      { label: 'QC queue', path: '/qc', icon: FactCheckIcon, owner: 'smk', artboard: 14 },
    ],
  },
  {
    heading: 'Riders',
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
    items: [
      { label: 'Weekly payment run', path: '/payments/run', icon: ReceiptIcon, owner: 'unassigned', artboard: 15 },
      { label: 'Overdue riders', path: '/payments/overdue', icon: WarningIcon, owner: 'unassigned', artboard: 17 },
    ],
  },
  {
    heading: 'Admin',
    items: [
      { label: 'Users & roles', path: '/users', icon: AdminIcon, owner: 'unassigned', artboard: 18 },
      { label: 'Audit log', path: '/audit', icon: HistoryIcon, owner: 'unassigned', artboard: 19 },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV.flatMap((s) => s.items);
