import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authService } from '../utils/api';
import { disableAdminModeStorage, enableAdminModeStorage } from '../hooks/useAdminMode';

export default function AdminAccessPage() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const currentPath = location.pathname || '/admin';

    if (currentPath === '/admin/logout') {
      disableAdminModeStorage();
      authService.logout().catch(() => null).finally(() => {
        navigate('/', { replace: true });
      });
      return;
    }

    enableAdminModeStorage();

    const nextPath = currentPath.replace(/^\/admin/, '') || '/';
    navigate(nextPath, { replace: true });
  }, [location.pathname, navigate]);

  return null;
}
