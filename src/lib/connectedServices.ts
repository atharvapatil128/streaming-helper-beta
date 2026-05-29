import { supabase } from './supabase';
import type { Permission } from '../types';

// ── Service catalogue ───────────────────────────────────────────────────────
// Single source of truth for every service the app knows about.
// Used both in the data layer (to supply the icon when upserting) and
// in the UI (to build the "Add Service" picker list).

export interface ServiceEntry {
  name: string;
  icon: string;
}

export const SERVICES_CATALOG: ServiceEntry[] = [
  { name: 'Netflix',      icon: 'N'  },
  { name: 'Prime Video',  icon: 'P'  },
  { name: 'Disney+',      icon: 'D+' },
  { name: 'Max',          icon: 'M'  },
  { name: 'Hulu',         icon: 'H'  },
  { name: 'Apple TV+',    icon: 'A'  },
  { name: 'Peacock',      icon: 'Pc' },
  { name: 'Paramount+',   icon: 'P+' },
  { name: 'YouTube',      icon: 'Y'  },
];

// Icon lookup by name — falls back to first letter if not in catalog
const ICON_MAP = Object.fromEntries(
  SERVICES_CATALOG.map((s) => [s.name, s.icon])
);

function iconFor(name: string): string {
  return ICON_MAP[name] ?? name.charAt(0).toUpperCase();
}

// ── Row → app type ──────────────────────────────────────────────────────────

type Row = {
  id: string;
  service_name: string;
  service_icon: string | null;
  is_connected: boolean;
};

function rowToPermission(row: Row): Permission {
  return {
    id:          row.id,
    service:     row.service_name,
    icon:        row.service_icon ?? iconFor(row.service_name),
    isConnected: row.is_connected,
    description: 'Access watch history and availability',
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

const SELECT_COLS = 'id, service_name, service_icon, is_connected';

export async function fetchConnectedServices(userId: string): Promise<Permission[]> {
  const { data, error } = await supabase
    .from('connected_services')
    .select(SELECT_COLS)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToPermission);
}

/** Insert or reactivate a service row and set is_connected = true. */
export async function connectService(
  userId: string,
  serviceName: string
): Promise<Permission> {
  const { data, error } = await supabase
    .from('connected_services')
    .upsert(
      {
        user_id:      userId,
        service_name: serviceName,
        service_icon: iconFor(serviceName),
        is_connected: true,
        updated_at:   new Date().toISOString(),
      },
      { onConflict: 'user_id,service_name' }
    )
    .select(SELECT_COLS)
    .single();

  if (error) throw new Error(error.message);
  return rowToPermission(data);
}

/** Flip the is_connected flag on an existing row. */
export async function toggleConnectedService(
  id: string,
  isConnected: boolean
): Promise<void> {
  const { data, error } = await supabase
    .from('connected_services')
    .update({ is_connected: isConnected, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id');

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error('Could not update service — permission denied or record not found.');
  }
}
