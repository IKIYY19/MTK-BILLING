import { Navigate, useLocation } from 'react-router-dom';
import { isAuthenticated } from '../lib/auth';
import { canAccessFeature } from '../lib/permissions';

export function ProtectedRoute({ children, feature }) {
  const location = useLocation();
  const authenticated = isAuthenticated();
  const user = JSON.parse(localStorage.getItem('auth_user') || 'null');

  if (!authenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check feature access if feature is specified
  if (feature && !canAccessFeature(user, feature)) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-white mb-2">Access Denied</h2>
          <p className="text-zinc-400">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return children;
}
