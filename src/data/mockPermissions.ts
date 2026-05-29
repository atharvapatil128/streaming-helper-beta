import type { Permission } from '../types';

export const mockPermissions: Permission[] = [
  {
    id: '1',
    service: 'Netflix',
    icon: 'N',
    isConnected: true,
    description: 'Access watch history and availability',
  },
  {
    id: '2',
    service: 'Disney+',
    icon: 'D+',
    isConnected: true,
    description: 'Access watch history and availability',
  },
  {
    id: '3',
    service: 'HBO Max',
    icon: 'H',
    isConnected: false,
    description: 'Access watch history and availability',
  },
  {
    id: '4',
    service: 'Prime Video',
    icon: 'P',
    isConnected: true,
    description: 'Access watch history and availability',
  },
];
