import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const LS_KEY = 'portfolio_admin';

/**
 * Admin mode toggle:
 * - Add ?admin=1 once to enable (persisted in localStorage)
 * - Add ?admin=0 to disable
 */
export default function useAdminMode() {
  const location = useLocation();

  const [isAdmin, setIsAdmin] = useState(() => {
    try {
      return window.localStorage.getItem(LS_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const flag = params.get('admin');

    if (flag === '1') {
      try {
        window.localStorage.setItem(LS_KEY, '1');
      } catch {}
      setIsAdmin(true);
    }

    if (flag === '0') {
      try {
        window.localStorage.removeItem(LS_KEY);
      } catch {}
      setIsAdmin(false);
    }
  }, [location.search]);

  return isAdmin;
}
