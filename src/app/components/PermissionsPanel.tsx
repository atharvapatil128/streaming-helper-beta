import { Shield, Check, X } from 'lucide-react';

interface Permission {
  id: string;
  service: string;
  icon: string;
  isConnected: boolean;
  description: string;
}

interface PermissionsPanelProps {
  permissions: Permission[];
  onToggle: (id: string) => void;
}

export function PermissionsPanel({ permissions, onToggle }: PermissionsPanelProps) {
  return (
    <div className="bg-[#1a1a22] border border-[#2a2a35] rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-5 h-5 text-[#5b5bd6]" />
        <h3 className="text-[#e4e4e7]">Connected Services</h3>
      </div>

      <div className="space-y-3">
        {permissions.map((permission) => (
          <div
            key={permission.id}
            className="flex items-center justify-between p-4 bg-[#0f0f14] rounded-lg border border-[#2a2a35]"
          >
            <div className="flex items-center gap-3 flex-1">
              <div className="w-10 h-10 bg-[#2a2a35] rounded-lg flex items-center justify-center text-xl">
                {permission.icon}
              </div>
              <div>
                <div className="text-[#e4e4e7]">{permission.service}</div>
                <div className="text-xs text-[#8b8b9e]">{permission.description}</div>
              </div>
            </div>

            <button
              onClick={() => onToggle(permission.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                permission.isConnected
                  ? 'bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/30'
                  : 'bg-[#8b8b9e]/10 text-[#8b8b9e] border border-[#8b8b9e]/30'
              }`}
            >
              {permission.isConnected ? (
                <>
                  <Check className="w-3 h-3" />
                  <span className="text-xs">Connected</span>
                </>
              ) : (
                <>
                  <X className="w-3 h-3" />
                  <span className="text-xs">Disconnected</span>
                </>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
