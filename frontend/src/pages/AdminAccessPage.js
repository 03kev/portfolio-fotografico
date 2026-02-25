import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authService } from '../utils/api';
import { disableAdminModeStorage, enableAdminModeStorage } from '../hooks/useAdminMode';
import NotFoundPage from './NotFoundPage';

export default function AdminAccessPage() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const currentPath = location.pathname || '/admin';
    const normalizedPath = currentPath.replace(/\/+$/, '') || '/';

    if (normalizedPath === '/admin/logout') {
      disableAdminModeStorage();
      authService.logout().catch(() => null).finally(() => {
        navigate('/', { replace: true });
      });
      return;
    }

    if (normalizedPath !== '/admin') return;

    enableAdminModeStorage();

    const nextPath = normalizedPath.replace(/^\/admin/, '') || '/';
    navigate(nextPath, { replace: true });
  }, [location.pathname, navigate]);

  const normalizedPath = (location.pathname || '/admin').replace(/\/+$/, '') || '/';
  if (normalizedPath !== '/admin' && normalizedPath !== '/admin/logout') {
    return <NotFoundPage />;
  }

  return null;
}
