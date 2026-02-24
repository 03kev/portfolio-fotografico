import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

export const ADMIN_MODE_LS_KEY = 'portfolio_admin';
const ADMIN_ROUTE_PREFIX = '/admin';

export function enableAdminModeStorage() {
  try {
    window.localStorage.setItem(ADMIN_MODE_LS_KEY, '1');
  } catch {}
}

export function disableAdminModeStorage() {
  try {
    window.localStorage.removeItem(ADMIN_MODE_LS_KEY);
  } catch {}
}

/**
 * Admin mode toggle persisted in localStorage.
 * - Open /admin to enable admin mode
 * - Open /admin/logout to disable admin mode
 */
export default function useAdminMode() {
  const location = useLocation();

  const [isAdmin, setIsAdmin] = useState(() => {
    try {
      return window.localStorage.getItem(ADMIN_MODE_LS_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const path = location.pathname || '';
    const isAdminRoute = path === ADMIN_ROUTE_PREFIX || path.startsWith(`${ADMIN_ROUTE_PREFIX}/`);

    if (!isAdminRoute) return;

    if (path === '/admin/logout') {
      disableAdminModeStorage();
      setIsAdmin(false);
      return;
    }

    if (path === '/admin' || path.startsWith('/admin/')) {
      enableAdminModeStorage();
      setIsAdmin(true);
    }
  }, [location.pathname]);

  return isAdmin;
}
