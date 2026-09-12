// oxlint-disable react/only-export-components -- Every route below is a `lazy()`
// wrapper, which reads as a component declaration to the fast-refresh rule. The
// module exports one thing, `router`, and is never itself hot-reloaded as a
// component; splitting twenty-six one-line wrappers into their own files to
// satisfy the heuristic would make the route table unreadable for no gain.
import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout';
import { RouteError } from '../components/RouteError';
import { Login } from '../pages/Login';

/**
 * Every artboard in the signed-off wireframe has a route. The ones that are
 * not built render a Placeholder naming the artboard and its owner, so a demo
 * can walk the whole rail without hitting a dead link — and so it stays
 * obvious what is left.
 *
 * **Every screen behind the shell is code-split.** One bundle shipped all
 * twenty-six screens to a fleet operator who opens three of them; now the
 * first paint carries the shell and nothing else, and a screen arrives when it
 * is asked for. `AppLayout` holds the single Suspense boundary — the rail and
 * the mode toggle never unmount, so a navigation swaps the column rather than
 * blanking the page. See `npm run size` for the budget this buys.
 *
 * `Login` is deliberately *not* split. Splitting it was tried and measured: it
 * saved 3KB gzipped, because the shell already pulls MUI's input stack through
 * the rail and the mode toggle, and it bought that with a spinner on the one
 * screen where there is nothing else on the page to look at.
 *
 * The pages export named components, so each import is mapped to a default —
 * that is the whole reason for the `.then()` on every line below.
 */
const Dashboard = lazy(() => import('../pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const TodayOperations = lazy(() =>
  import('../pages/operations/TodayOperations').then((m) => ({ default: m.TodayOperations })),
);

// Fleet — SMK
const VehiclesList = lazy(() => import('../pages/vehicles/VehiclesList').then((m) => ({ default: m.VehiclesList })));
const AddVehicle = lazy(() => import('../pages/vehicles/AddVehicle').then((m) => ({ default: m.AddVehicle })));
const BulkUploadVehicles = lazy(() =>
  import('../pages/vehicles/BulkUploadVehicles').then((m) => ({ default: m.BulkUploadVehicles })),
);
const VehicleDetail = lazy(() => import('../pages/vehicles/VehicleDetail').then((m) => ({ default: m.VehicleDetail })));
const Inspection = lazy(() => import('../pages/workshop/Inspection').then((m) => ({ default: m.Inspection })));
const QcQueue = lazy(() => import('../pages/workshop/QcQueue').then((m) => ({ default: m.QcQueue })));
const ServiceManagement = lazy(() =>
  import('../pages/service/ServiceManagement').then((m) => ({ default: m.ServiceManagement })),
);

// Riders — Abhiram
const RidersList = lazy(() => import('../pages/riders/RidersList').then((m) => ({ default: m.RidersList })));
const OnboardRider = lazy(() => import('../pages/riders/OnboardRider').then((m) => ({ default: m.OnboardRider })));
const RiderDetail = lazy(() => import('../pages/riders/RiderDetail').then((m) => ({ default: m.RiderDetail })));
const AssignVehicle = lazy(() =>
  import('../pages/assignments/AssignVehicle').then((m) => ({ default: m.AssignVehicle })),
);
const ExchangeVehicle = lazy(() =>
  import('../pages/assignments/ExchangeVehicle').then((m) => ({ default: m.ExchangeVehicle })),
);
const DeboardRider = lazy(() =>
  import('../pages/assignments/DeboardRider').then((m) => ({ default: m.DeboardRider })),
);

// Money — SMK
const PaymentRun = lazy(() => import('../pages/payments/PaymentRun').then((m) => ({ default: m.PaymentRun })));
const PaymentReceipt = lazy(() =>
  import('../pages/payments/PaymentReceipt').then((m) => ({ default: m.PaymentReceipt })),
);
const OverdueRiders = lazy(() => import('../pages/payments/OverdueRiders').then((m) => ({ default: m.OverdueRiders })));
const RecoverySummary = lazy(() =>
  import('../pages/recovery/RecoverySummary').then((m) => ({ default: m.RecoverySummary })),
);

// Admin — SMK
const Users = lazy(() => import('../pages/users/Users').then((m) => ({ default: m.Users })));
const AuditLog = lazy(() => import('../pages/admin/AuditLog').then((m) => ({ default: m.AuditLog })));
const DesignTokens = lazy(() => import('../pages/admin/DesignTokens').then((m) => ({ default: m.DesignTokens })));

export const router = createBrowserRouter([
  { path: '/login', element: <Login />, errorElement: <RouteError /> },
  {
    element: <AppLayout />,
    // One boundary for the whole shell: a screen that throws — or a chunk that
    // 404s after a deploy — loses the content column, not the application.
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: '/dashboard', element: <Dashboard /> },

      // Operations — SMK
      { path: '/operations/today', element: <TodayOperations /> },

      // Fleet — SMK
      { path: '/vehicles', element: <VehiclesList /> },
      { path: '/vehicles/new', element: <AddVehicle /> },
      { path: '/vehicles/bulk-upload', element: <BulkUploadVehicles /> },
      { path: '/vehicles/:vehicleId', element: <VehicleDetail /> },
      { path: '/inspections', element: <Inspection /> },
      { path: '/qc', element: <QcQueue /> },
      { path: '/service', element: <ServiceManagement /> },

      // Riders — Abhiram
      { path: '/riders', element: <RidersList /> },
      { path: '/riders/onboard', element: <OnboardRider /> },
      { path: '/riders/:riderId', element: <RiderDetail /> },
      { path: '/assignments/assign', element: <AssignVehicle /> },
      { path: '/assignments/exchange', element: <ExchangeVehicle /> },
      { path: '/assignments/deboard', element: <DeboardRider /> },

      // Money — SMK
      { path: '/payments/run', element: <PaymentRun /> },
      { path: '/payments/run/:riderId', element: <PaymentReceipt /> },
      { path: '/payments/overdue', element: <OverdueRiders /> },
      { path: '/recovery', element: <RecoverySummary /> },

      // Admin — SMK
      { path: '/users', element: <Users /> },
      { path: '/audit', element: <AuditLog /> },
      { path: '/design-tokens', element: <DesignTokens /> },

      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);
