import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout';
import { Login } from '../pages/Login';
import { Dashboard } from '../pages/Dashboard';
import { VehiclesList } from '../pages/vehicles/VehiclesList';
import { VehicleDetail } from '../pages/vehicles/VehicleDetail';
import { AddVehicle } from '../pages/vehicles/AddVehicle';
import { BulkUploadVehicles } from '../pages/vehicles/BulkUploadVehicles';
import { Inspection } from '../pages/workshop/Inspection';
import { QcQueue } from '../pages/workshop/QcQueue';
import { RidersList } from '../pages/riders/RidersList';
import { RiderDetail } from '../pages/riders/RiderDetail';
import { OnboardRider } from '../pages/riders/OnboardRider';
import { AssignVehicle } from '../pages/assignments/AssignVehicle';
import { ExchangeVehicle } from '../pages/assignments/ExchangeVehicle';
import { DeboardRider } from '../pages/assignments/DeboardRider';
import { PaymentRun } from '../pages/payments/PaymentRun';
import { PaymentReceipt } from '../pages/payments/PaymentReceipt';
import { OverdueRiders } from '../pages/payments/OverdueRiders';
import { Users } from '../pages/users/Users';
import { AuditLog } from '../pages/admin/AuditLog';
import { TodayOperations } from '../pages/operations/TodayOperations';
import { ServiceManagement } from '../pages/service/ServiceManagement';
import { RecoverySummary } from '../pages/recovery/RecoverySummary';

/**
 * Every artboard in the signed-off wireframe has a route. The ones that are
 * not built render a Placeholder naming the artboard and its owner, so a demo
 * can walk the whole rail without hitting a dead link — and so it stays
 * obvious what is left.
 *
 * Built here: shell, login, dashboard, and the vehicle flow (SMK).
 * Stubbed for Abhiram: riders, onboarding, assign, exchange, deboard.
 */
export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    element: <AppLayout />,
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
      {
        path: '/riders',
        element: <RidersList />,
      },
      {
        path: '/riders/onboard',
        element: <OnboardRider />,
      },
      {
        path: '/riders/:riderId',
        element: <RiderDetail />,
      },
      {
        path: '/assignments/assign',
        element: <AssignVehicle />,
      },
      {
        path: '/assignments/exchange',
        element: <ExchangeVehicle />,
      },
      {
        path: '/assignments/deboard',
        element: <DeboardRider />,
      },

      // Money — SMK
      { path: '/payments/run', element: <PaymentRun /> },
      { path: '/payments/run/:riderId', element: <PaymentReceipt /> },
      { path: '/payments/overdue', element: <OverdueRiders /> },
      { path: '/recovery', element: <RecoverySummary /> },

      // Admin — SMK
      { path: '/users', element: <Users /> },
      { path: '/audit', element: <AuditLog /> },

      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);
