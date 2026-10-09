import type { ReactElement } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { useAuth } from "./auth/useAuth";
import { Layout } from "./components/Layout";
import { Spinner } from "./components/ui";
import { Cameras } from "./pages/Cameras";
import { Dashboard } from "./pages/Dashboard";
import { Employees } from "./pages/Employees";
import { Events } from "./pages/Events";
import { Leaves } from "./pages/Leaves";
import { Login } from "./pages/Login";
import { SystemHealth } from "./pages/SystemHealth";
import { Users } from "./pages/Users";

function FullPageLoader() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <Spinner size="lg" label="Loading your session" />
    </div>
  );
}

function RequireAuth({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth();

  // While a stored token is being validated, neither redirect nor render the
  // app: sending the user to /login first would flash the sign-in screen on
  // every reload.
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          // Redirecting declaratively avoids the old bug of calling navigate()
          // during render, which React logs as a state update on another
          // component.
          element={!loading && user ? <Navigate to="/" replace /> : <Login />}
        />

        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="cameras" element={<Cameras />} />
          <Route path="employees" element={<Employees />} />
          <Route path="leaves" element={<Leaves />} />
          <Route path="events" element={<Events />} />
          <Route path="users" element={<Users />} />
          <Route path="health" element={<SystemHealth />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
