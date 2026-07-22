import { House, Images, Mail, Map, PanelsTopLeft, UserRound } from 'lucide-react';

export const HEADER_NAV_ITEMS = [
  { to: '/', label: 'Home' },
  { to: '/series', label: 'Serie' },
  { to: '/map', label: 'Mappa' },
  { to: '/gallery', label: 'Archivio' },
  { to: '/about', label: 'Chi sono' },
  { to: '/contact', label: 'Contatti' }
];

export const HEADER_MOBILE_PRIMARY_ITEMS = [
  { to: '/', label: 'Home', icon: House },
  { to: '/series', label: 'Serie', icon: PanelsTopLeft },
  { to: '/map', label: 'Mappa', icon: Map },
  { to: '/gallery', label: 'Archivio', icon: Images }
];

export const HEADER_MOBILE_SECONDARY_ITEMS = [
  { to: '/about', label: 'Chi sono', icon: UserRound },
  { to: '/contact', label: 'Contatti', icon: Mail }
];
