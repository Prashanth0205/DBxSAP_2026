import { createBrowserRouter, RouterProvider, NavLink, Outlet } from 'react-router';
import { MapPage } from './pages/MapPage';
import { FacilityPage } from './pages/FacilityPage';
import { FacilityListPage } from './pages/FacilityListPage';
import { WorkspacePage } from './pages/WorkspacePage';
import { HomePage } from './pages/HomePage';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
    isActive
      ? 'bg-[#FF3621] text-white'
      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
  }`;

function Layout() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b px-6 py-3 flex items-center gap-6 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-[#FF3621]">Disha</span>
          <span className="text-xs text-gray-400 font-medium tracking-wide uppercase">
            Medical Desert Planner
          </span>
        </div>
        <nav className="flex gap-1 ml-4">
          <NavLink to="/" end className={navClass}>Home</NavLink>
          <NavLink to="/map" className={navClass}>Coverage Map</NavLink>
          <NavLink to="/workspace" className={navClass}>Planning Workspace</NavLink>
        </nav>
      </header>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/map', element: <MapPage /> },
      { path: '/facility/list', element: <FacilityListPage /> },
      { path: '/facility/:id', element: <FacilityPage /> },
      { path: '/workspace', element: <WorkspacePage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
