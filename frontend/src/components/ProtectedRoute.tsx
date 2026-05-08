import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

export const ProtectedRoute = () => {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Wait for bootstrap (silent refresh from httpOnly cookie) before redirecting.
  // This prevents flashing the login page on a hard reload when the user is still logged in.
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-brand-500" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
};
