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
        element: (
          <Placeholder
            section="Riders"
            title="Riders"
            artboard={7}
            owner="abhiram"
            summary="The rider register: active and inactive filter, search by name, phone or bike, and the payment and KYC state of each rider."
          />
        ),
      },
      {
        path: '/riders/onboard',
        element: (
          <Placeholder
            section="Riders"
            title="Onboard rider"
            artboard={9}
            owner="abhiram"
            summary="Rider details, documents, the weekly plan and the deposit. Ends with the rider on the register but without a bike — assignment is a separate, recorded event."
          />
        ),
      },
      {
        path: '/riders/:riderId',
        element: (
          <Placeholder
            section="Riders"
            title="Rider detail"
            artboard={8}
            owner="abhiram"
            summary="Profile, documents, the current bike, and the full assignment and payment history for one rider."
          />
        ),
      },
      {
        path: '/assignments/assign',
        element: (
          <Placeholder
            section="Riders"
            title="Assign vehicle"
            artboard={10}
            owner="abhiram"
            summary="Assign a bike to a rider. Only bikes in Ready to deploy can be picked, and a rider can hold only one bike at a time."
          />
        ),
      },
      {
        path: '/assignments/exchange',
        element: (
          <Placeholder
            section="Riders"
            title="Exchange vehicle"
            artboard={11}
            owner="abhiram"
            summary="Swap a rider onto a different bike. Recorded as two events — the old assignment closes and a new one opens — never as an overwrite."
          />
        ),
      },
      {
        path: '/assignments/deboard',
        element: (
          <Placeholder
            section="Riders"
            title="Deboard rider"
            artboard={12}
            owner="abhiram"
            summary="Take the bike back: condition capture, outstanding dues, deposit settlement. This is the gate — nothing else closes an assignment."
          />
        ),
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
