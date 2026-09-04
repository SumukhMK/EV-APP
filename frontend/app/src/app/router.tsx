import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout';
import { Login } from '../pages/Login';
import { Dashboard } from '../pages/Dashboard';
import { Placeholder } from '../pages/Placeholder';
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

      // Fleet — SMK
      { path: '/vehicles', element: <VehiclesList /> },
      { path: '/vehicles/new', element: <AddVehicle /> },
      { path: '/vehicles/bulk-upload', element: <BulkUploadVehicles /> },
      { path: '/vehicles/:vehicleId', element: <VehicleDetail /> },
      { path: '/inspections', element: <Inspection /> },
      { path: '/qc', element: <QcQueue /> },

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

      // Money and admin — not yet assigned
      {
        path: '/payments/run',
        element: (
          <Placeholder
            section="Money"
            title="Weekly payment run"
            artboard={15}
            owner="unassigned"
            summary="The Monday and Wednesday billing cycles: what each rider owes, what was paid, and what rolls into arrears."
          />
        ),
      },
      {
        path: '/payments/overdue',
        element: (
          <Placeholder
            section="Money"
            title="Overdue riders"
            artboard={17}
            owner="unassigned"
            summary="Everyone behind on rent, ordered by days overdue, with the reminder or repossession stage each has reached."
          />
        ),
      },
      {
        path: '/users',
        element: (
          <Placeholder
            section="Admin"
            title="Users & roles"
            artboard={18}
            owner="unassigned"
            summary="Who can use the system and what each role may do. Enforced server-side once the API exists."
          />
        ),
      },
      {
        path: '/audit',
        element: (
          <Placeholder
            section="Admin"
            title="Audit log"
            artboard={19}
            owner="unassigned"
            summary="Append-only record of every change to money, KYC and assignments: who, when, before and after."
          />
        ),
      },

      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);
