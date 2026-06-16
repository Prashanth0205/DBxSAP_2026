import { createBrowserRouter, RouterProvider, NavLink, Outlet, Navigate } from 'react-router';
import { MapPage } from './pages/MapPage';
import { DistrictPage } from './pages/DistrictPage';
import { WorkspacePage } from './pages/WorkspacePage';

function Layout() {
  return (
    <div className="h-screen flex flex-col bg-[#0e1117] overflow-hidden">
      <header className="flex-shrink-0 flex items-center justify-between px-5 h-12 bg-[#0e1117] border-b border-white/8">
        <div className="flex items-center gap-3">
          <img src="/disha-logo.png" alt="Disha" className="h-9 w-9 object-contain" />
          <span className="text-white font-semibold tracking-tight text-sm">Disha</span>
          <span className="text-white/30 text-xs font-medium hidden sm:block">Medical Desert Planner</span>
        </div>
        <nav className="flex items-center gap-1">
          <NavLink
            to="/map"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                isActive ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'
              }`
            }
          >
            Coverage Map
          </NavLink>
          <NavLink
            to="/workspace"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                isActive ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'
              }`
            }
          >
            Workspace
          </NavLink>
        </nav>
      </header>
      <main className="flex-1 min-h-0">
        <Outlet />
      </main>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Navigate to="/map" replace /> },
      { path: '/map', element: <MapPage /> },
      { path: '/district/:district', element: <DistrictPage /> },
      { path: '/workspace', element: <WorkspacePage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
