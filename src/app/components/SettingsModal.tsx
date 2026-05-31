import {
  X, Shield, Bell, User, ExternalLink, Plus, Search, Loader2, Check, Pencil,
  AlertTriangle, Trash2, Lock, Eye, EyeOff,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useConnectedServices } from '../hooks/useConnectedServices';
import { useProfile } from '../hooks/useProfile';
import { SERVICES_CATALOG } from '../../lib/connectedServices';

interface SettingsModalProps {
  onClose: () => void;
}

type SettingsSection = 'services' | 'privacy' | 'notifications' | 'account';

// ── LocalStorage helpers (Beta 1 privacy prefs) ──────────────────────────────
function getLocalPref(key: string, def: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? (JSON.parse(v) as boolean) : def;
  } catch {
    return def;
  }
}
function setLocalPref(key: string, value: boolean): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// ── Initials helper ──────────────────────────────────────────────────────────
function getInitials(str: string | null | undefined): string {
  if (!str) return '?';
  const words = str.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return str.slice(0, 2).toUpperCase();
}

// ── Reusable toggle ──────────────────────────────────────────────────────────
function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
        disabled ? 'opacity-40 cursor-not-allowed' : ''
      } ${checked ? 'bg-[#5b5bd6]' : 'bg-[#2a2a35]'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

// ── Coming-soon badge ────────────────────────────────────────────────────────
function ComingSoon() {
  return (
    <span className="px-2 py-0.5 bg-[#2a2a35] text-[#8b8b9e] text-xs rounded">
      Coming soon
    </span>
  );
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  // ── Supabase-backed hooks ────────────────────────────────────────────────
  const {
    services,
    loading: servicesLoading,
    error: servicesError,
    toggle: toggleService,
    connect: connectService,
  } = useConnectedServices();

  const {
    profile,
    loading: profileLoading,
    saving: profileSaving,
    error: profileError,
    updateDisplayName,
  } = useProfile();

  // ── Active section ────────────────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState<SettingsSection>('services');

  // ── Add-service modal state ──────────────────────────────────────────────
  const [showAddServiceModal, setShowAddServiceModal]   = useState(false);
  const [serviceSearchQuery, setServiceSearchQuery]     = useState('');
  const [connectingService, setConnectingService]       = useState<string | null>(null);
  const [connectServiceError, setConnectServiceError]   = useState<string | null>(null);

  // ── Account section state ────────────────────────────────────────────────
  const [editingName, setEditingName]   = useState(false);
  const [nameInput, setNameInput]       = useState('');
  const [nameSaveError, setNameSaveError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // ── Change password state ─────────────────────────────────────────────────
  const [editingPassword, setEditingPassword]         = useState(false);
  const [newPassword, setNewPassword]                 = useState('');
  const [confirmPassword, setConfirmPassword]         = useState('');
  const [showNewPassword, setShowNewPassword]         = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordSaving, setPasswordSaving]           = useState(false);
  const [passwordError, setPasswordError]             = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess]         = useState(false);

  // ── Delete account state ─────────────────────────────────────────────────
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput]             = useState('');
  const [deleting, setDeleting]                   = useState(false);
  const [deleteError, setDeleteError]             = useState<string | null>(null);

  // ── Privacy preferences (Beta 1 — localStorage) ──────────────────────────
  const [allowRecRequests, setAllowRecRequests] = useState(() =>
    getLocalPref('sh_beta_allow_rec_requests', true)
  );
  const [activitySuggestions, setActivitySuggestions] = useState(() =>
    getLocalPref('sh_beta_activity_suggestions', true)
  );
  const [comfortPicks, setComfortPicks] = useState(() =>
    getLocalPref('sh_beta_comfort_picks', true)
  );

  // ── Notification preferences (local only) ────────────────────────────────
  const [inAppNotifications, setInAppNotifications] = useState(() =>
    getLocalPref('sh_beta_in_app_notifications', true)
  );

  // ── Escape key to close ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Focus the name input when editing starts
  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  // ── Derived values ────────────────────────────────────────────────────────
  const addedNames        = new Set(services.map((s) => s.service));
  const catalogNotAdded   = SERVICES_CATALOG.filter((s) => !addedNames.has(s.name));
  const filteredCatalog   = catalogNotAdded.filter((s) =>
    s.name.toLowerCase().includes(serviceSearchQuery.toLowerCase())
  );

  // Display label for the account avatar
  const avatarLabel = profile?.displayName ?? profile?.email?.split('@')[0] ?? '?';

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleConnectService = async (name: string) => {
    setConnectingService(name);
    setConnectServiceError(null);
    try {
      await connectService(name);
      setShowAddServiceModal(false);
      setServiceSearchQuery('');
    } catch (err) {
      setConnectServiceError(err instanceof Error ? err.message : 'Failed to connect.');
    } finally {
      setConnectingService(null);
    }
  };

  const handleStartEditName = () => {
    setNameInput(profile?.displayName ?? '');
    setNameSaveError(null);
    setEditingName(true);
  };

  const handleSaveName = async () => {
    try {
      await updateDisplayName(nameInput);
      setEditingName(false);
    } catch (err) {
      setNameSaveError(err instanceof Error ? err.message : 'Save failed.');
    }
  };

  const handleCancelPassword = () => {
    setEditingPassword(false);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError(null);
    setPasswordSuccess(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  const handleChangePassword = async () => {
    setPasswordError(null);
    setPasswordSuccess(false);

    if (!newPassword)                       { setPasswordError('New password is required.');              return; }
    if (newPassword.length < 6)             { setPasswordError('Password must be at least 6 characters.'); return; }
    if (!confirmPassword)                   { setPasswordError('Please confirm your new password.');      return; }
    if (newPassword !== confirmPassword)    { setPasswordError('Passwords do not match.');                return; }

    setPasswordSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPasswordSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
      // Auto-close the form after a short delay so the user sees the success
      setTimeout(() => {
        setEditingPassword(false);
        setPasswordSuccess(false);
      }, 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update password.';
      // Supabase returns a specific message when reauthentication is required.
      setPasswordError(msg);
    } finally {
      setPasswordSaving(false);
    }
  };

  const privacyToggle = (
    key: string,
    value: boolean,
    setter: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    const next = !value;
    setter(next);
    setLocalPref(key, next);
  };

  const handleDeleteAccount = async () => {
    if (deleteInput !== 'DELETE') return;
    setDeleting(true);
    setDeleteError(null);
    try {
      // Calls the `delete-account` Supabase Edge Function. The function reads
      // the user's JWT from the Authorization header (auto-attached by the
      // client), validates it, then uses the service-role key (server-side
      // only) to delete public-schema data and the auth.users row.
      const { data, error } = await supabase.functions.invoke<{
        success?: boolean;
        error?: string;
        detail?: string;
      }>('delete-account', { method: 'POST' });

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error ?? 'Account deletion failed.');
      }

      // Auth user is gone. Clear the local session so useAuth flips us back
      // to the AuthScreen. signOut() will fail server-side (no user), but
      // the client cache is still cleared, which is what we need.
      await supabase.auth.signOut().catch(() => { /* expected after delete */ });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete account.');
      setDeleting(false);
    }
  };

  const sections = [
    { id: 'services'      as const, label: 'Connected Services',  icon: Shield },
    { id: 'privacy'       as const, label: 'Privacy & Sharing',   icon: Shield },
    { id: 'notifications' as const, label: 'Notifications',       icon: Bell   },
    { id: 'account'       as const, label: 'Account',             icon: User   },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f0f14] border border-[#1f1f28] rounded-2xl w-full max-w-5xl h-[85vh] shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#1f1f28]">
          <div>
            <h2 className="text-xl text-[#e4e4e7]">Settings</h2>
            <p className="text-sm text-[#8b8b9e] mt-1">Manage your preferences and connections</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#1f1f28] rounded-lg transition-colors">
            <X className="w-5 h-5 text-[#8b8b9e]" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <aside className="w-64 border-r border-[#1f1f28] p-4">
            <nav className="space-y-1">
              {sections.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveSection(id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    activeSection === id
                      ? 'bg-[#5b5bd6] text-white'
                      : 'text-[#8b8b9e] hover:bg-[#1f1f28] hover:text-[#e4e4e7]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm">{label}</span>
                </button>
              ))}
            </nav>
          </aside>

          {/* Main */}
          <main className="flex-1 overflow-y-auto p-8">

            {/* ── Connected Services ─────────────────────────────────────── */}
            {activeSection === 'services' && (
              <div className="max-w-3xl">
                <div className="mb-6 flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg text-[#e4e4e7] mb-2">Connected Streaming Services</h3>
                    <p className="text-sm text-[#8b8b9e]">
                      Connect your streaming accounts so the Helper can understand availability,
                      watch history, and comfort rewatch patterns.
                    </p>
                  </div>
                  <button
                    onClick={() => { setShowAddServiceModal(true); setConnectServiceError(null); }}
                    className="px-4 py-2 bg-[#5b5bd6] hover:bg-[#7c7ce8] rounded-lg flex items-center gap-2 transition-colors flex-shrink-0 ml-4"
                  >
                    <Plus className="w-4 h-4" />
                    Add Streaming Service
                  </button>
                </div>

                {servicesError && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <p className="text-sm text-red-400">{servicesError}</p>
                  </div>
                )}

                {servicesLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 text-[#5b5bd6] animate-spin" />
                    <span className="ml-3 text-sm text-[#8b8b9e]">Loading services…</span>
                  </div>
                ) : services.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 bg-[#1f1f28] rounded-2xl flex items-center justify-center mb-4">
                      <Shield className="w-8 h-8 text-[#8b8b9e]" />
                    </div>
                    <h4 className="text-[#e4e4e7] mb-2">No services connected yet</h4>
                    <p className="text-sm text-[#8b8b9e] max-w-sm">
                      Tap "Add Streaming Service" above to connect your first account.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {services.map((svc) => (
                      <div
                        key={svc.id}
                        className="flex items-center justify-between p-4 bg-[#1f1f28] rounded-xl hover:bg-[#2a2a35] transition-colors"
                      >
                        <div className="flex items-center gap-4 flex-1">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold ${
                            svc.isConnected ? 'bg-[#5b5bd6] text-white' : 'bg-[#2a2a35] text-[#8b8b9e]'
                          }`}>
                            {svc.icon}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[#e4e4e7]">{svc.service}</span>
                              <span className={`px-2 py-0.5 rounded text-xs ${
                                svc.isConnected
                                  ? 'bg-[#5b5bd6]/20 text-[#a5a5ff]'
                                  : 'bg-[#2a2a35] text-[#8b8b9e]'
                              }`}>
                                {svc.isConnected ? 'Connected' : 'Not connected'}
                              </span>
                            </div>
                            <div className="text-sm text-[#8b8b9e]">{svc.description}</div>
                          </div>
                        </div>
                        <Toggle
                          checked={svc.isConnected}
                          onChange={() => toggleService(svc.id)}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-6 p-4 bg-[#1f1f28] rounded-xl border border-[#2a2a35]">
                  <p className="text-sm text-[#8b8b9e]">
                    Your streaming data is encrypted and only used to personalize recommendations,
                    comfort picks, and title availability. You can disconnect services anytime.
                  </p>
                </div>
              </div>
            )}

            {/* ── Privacy & Sharing ──────────────────────────────────────── */}
            {activeSection === 'privacy' && (
              <div className="max-w-3xl space-y-6">
                <div>
                  <h3 className="text-lg text-[#e4e4e7] mb-1">Privacy & Sharing</h3>
                  <p className="text-sm text-[#8b8b9e] mb-1">
                    Control how your data is used within Streaming Helper
                  </p>
                  <p className="text-xs text-[#5b5bd6]">
                    Beta — these preferences are saved locally on this device
                  </p>
                </div>

                <div className="space-y-3">
                  {/* Allow rec requests */}
                  <div className="p-4 bg-[#1f1f28] rounded-xl">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h4 className="text-[#e4e4e7] mb-1">Allow friends to send recommendations</h4>
                        <p className="text-sm text-[#8b8b9e]">
                          Friends can add titles to your recommendations list
                        </p>
                      </div>
                      <Toggle
                        checked={allowRecRequests}
                        onChange={() => privacyToggle('sh_beta_allow_rec_requests', allowRecRequests, setAllowRecRequests)}
                      />
                    </div>
                  </div>

                  {/* Activity for suggestions */}
                  <div className="p-4 bg-[#1f1f28] rounded-xl">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h4 className="text-[#e4e4e7] mb-1">Use helper activity to improve suggestions</h4>
                        <p className="text-sm text-[#8b8b9e]">
                          Allow Streaming Helper to analyze patterns for better recommendations
                        </p>
                      </div>
                      <Toggle
                        checked={activitySuggestions}
                        onChange={() => privacyToggle('sh_beta_activity_suggestions', activitySuggestions, setActivitySuggestions)}
                      />
                    </div>
                  </div>

                  {/* Comfort list for picks */}
                  <div className="p-4 bg-[#1f1f28] rounded-xl">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h4 className="text-[#e4e4e7] mb-1">Use comfort list for Comfort Pick</h4>
                        <p className="text-sm text-[#8b8b9e]">
                          Include your saved comfort titles when surfacing a Comfort Pick
                        </p>
                      </div>
                      <Toggle
                        checked={comfortPicks}
                        onChange={() => privacyToggle('sh_beta_comfort_picks', comfortPicks, setComfortPicks)}
                      />
                    </div>
                  </div>
                </div>

                {/* Coming-soon section */}
                <div className="pt-4 border-t border-[#1f1f28]">
                  <h4 className="text-[#e4e4e7] mb-3">More controls</h4>
                  <div className="space-y-3">
                    {[
                      { label: 'Granular friend sharing controls', desc: 'Choose exactly what each friend can see' },
                      { label: 'Export your data', desc: 'Download all your recommendations and watch history' },
                      { label: 'Delete watch history', desc: 'Clear activity used for suggestions' },
                    ].map((item) => (
                      <div key={item.label} className="p-4 bg-[#1f1f28] rounded-xl flex items-start justify-between gap-4 opacity-60">
                        <div>
                          <h5 className="text-[#e4e4e7] mb-1">{item.label}</h5>
                          <p className="text-sm text-[#8b8b9e]">{item.desc}</p>
                        </div>
                        <ComingSoon />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Legal links */}
                <div className="pt-4 border-t border-[#1f1f28]">
                  <h4 className="text-[#e4e4e7] mb-3">Legal</h4>
                  <div className="space-y-2">
                    {['Privacy Policy', 'Terms of Service'].map((label) => (
                      <button
                        key={label}
                        className="w-full flex items-center justify-between p-4 bg-[#1f1f28] rounded-xl hover:bg-[#2a2a35] transition-colors"
                      >
                        <span className="text-sm text-[#e4e4e7]">{label}</span>
                        <ExternalLink className="w-4 h-4 text-[#8b8b9e]" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Notifications ──────────────────────────────────────────── */}
            {activeSection === 'notifications' && (
              <div className="max-w-3xl space-y-6">
                <div>
                  <h3 className="text-lg text-[#e4e4e7] mb-2">Notification Preferences</h3>
                  <p className="text-sm text-[#8b8b9e] mb-1">
                    Choose how you want to be notified
                  </p>
                  <p className="text-xs text-[#5b5bd6]">
                    Beta — in-app notifications are saved locally on this device
                  </p>
                </div>

                <div className="space-y-3">
                  {/* In-app — functional */}
                  <div className="p-4 bg-[#1f1f28] rounded-xl">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h4 className="text-[#e4e4e7] mb-1">In-app notifications</h4>
                        <p className="text-sm text-[#8b8b9e]">
                          See new recommendations in the notification bell
                        </p>
                      </div>
                      <Toggle
                        checked={inAppNotifications}
                        onChange={() => {
                          const next = !inAppNotifications;
                          setInAppNotifications(next);
                          setLocalPref('sh_beta_in_app_notifications', next);
                        }}
                      />
                    </div>
                  </div>

                  {/* Email — coming soon */}
                  <div className="p-4 bg-[#1f1f28] rounded-xl opacity-60">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-[#e4e4e7]">Email notifications</h4>
                          <ComingSoon />
                        </div>
                        <p className="text-sm text-[#8b8b9e]">
                          Receive an email when friends share new recommendations
                        </p>
                      </div>
                      <Toggle checked={false} onChange={() => {}} disabled />
                    </div>
                  </div>

                  {/* Push — coming soon */}
                  <div className="p-4 bg-[#1f1f28] rounded-xl opacity-60">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-[#e4e4e7]">Push notifications</h4>
                          <ComingSoon />
                        </div>
                        <p className="text-sm text-[#8b8b9e]">
                          Browser push alerts for friend activity
                        </p>
                      </div>
                      <Toggle checked={false} onChange={() => {}} disabled />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Account ────────────────────────────────────────────────── */}
            {activeSection === 'account' && (
              <div className="max-w-3xl space-y-6">
                <div>
                  <h3 className="text-lg text-[#e4e4e7] mb-2">Account</h3>
                  <p className="text-sm text-[#8b8b9e]">
                    Your profile and account information
                  </p>
                </div>

                {profileLoading ? (
                  <div className="flex items-center gap-3 py-8">
                    <Loader2 className="w-5 h-5 text-[#5b5bd6] animate-spin" />
                    <span className="text-sm text-[#8b8b9e]">Loading profile…</span>
                  </div>
                ) : (
                  <>
                    {/* Profile card */}
                    <div className="flex items-center gap-4 p-5 bg-[#1f1f28] rounded-xl">
                      <div className="w-16 h-16 rounded-full bg-[#5b5bd6] flex items-center justify-center text-xl font-bold text-white flex-shrink-0">
                        {getInitials(avatarLabel)}
                      </div>
                      <div>
                        <div className="text-[#e4e4e7] font-medium">
                          {profile?.displayName ?? profile?.email?.split('@')[0] ?? 'Your account'}
                        </div>
                        <div className="text-sm text-[#8b8b9e] mt-0.5">{profile?.email}</div>
                        <p className="text-xs text-[#8b8b9e] mt-1">
                          Profile picture upload — Coming soon
                        </p>
                      </div>
                    </div>

                    {/* Error */}
                    {(profileError || nameSaveError) && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                        <p className="text-sm text-red-400">{profileError ?? nameSaveError}</p>
                      </div>
                    )}

                    {/* Display name */}
                    <div className="p-4 bg-[#1f1f28] rounded-xl">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 mr-4">
                          <h4 className="text-[#e4e4e7] mb-1">Display name</h4>
                          {editingName ? (
                            <input
                              ref={nameInputRef}
                              type="text"
                              value={nameInput}
                              onChange={(e) => setNameInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveName();
                                if (e.key === 'Escape') setEditingName(false);
                              }}
                              placeholder="How you appear to friends"
                              className="w-full bg-[#2a2a35] border border-[#3a3a45] rounded-lg px-3 py-2 text-sm text-[#e4e4e7] placeholder-[#8b8b9e] focus:outline-none focus:border-[#5b5bd6]"
                            />
                          ) : (
                            <p className="text-sm text-[#8b8b9e]">
                              {profile?.displayName ?? 'Not set — how you appear to friends'}
                            </p>
                          )}
                        </div>
                        {editingName ? (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={handleSaveName}
                              disabled={profileSaving}
                              className="px-3 py-1.5 bg-[#5b5bd6] hover:bg-[#7c7ce8] disabled:opacity-50 rounded-lg text-sm text-white flex items-center gap-1.5 transition-colors"
                            >
                              {profileSaving
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <Check className="w-3 h-3" />}
                              Save
                            </button>
                            <button
                              onClick={() => setEditingName(false)}
                              className="px-3 py-1.5 bg-[#2a2a35] hover:bg-[#353545] rounded-lg text-sm text-[#e4e4e7] transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={handleStartEditName}
                            className="p-2 text-[#8b8b9e] hover:text-[#e4e4e7] hover:bg-[#2a2a35] rounded-lg transition-colors flex-shrink-0"
                            title="Edit display name"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Email — read-only */}
                    <div className="p-4 bg-[#1f1f28] rounded-xl">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-[#e4e4e7] mb-1">Email address</h4>
                          <p className="text-sm text-[#8b8b9e]">{profile?.email ?? '—'}</p>
                        </div>
                        <ComingSoon />
                      </div>
                    </div>

                    {/* Password */}
                    <div className="p-4 bg-[#1f1f28] rounded-xl">
                      {!editingPassword ? (
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-[#e4e4e7] mb-1">Password</h4>
                            <p className="text-sm text-[#8b8b9e]">••••••••</p>
                          </div>
                          <button
                            onClick={() => { setEditingPassword(true); setPasswordError(null); setPasswordSuccess(false); }}
                            className="px-3 py-1.5 bg-[#2a2a35] hover:bg-[#353545] rounded-lg text-sm text-[#e4e4e7] flex items-center gap-1.5 transition-colors flex-shrink-0"
                          >
                            <Lock className="w-3.5 h-3.5" />
                            Change
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <h4 className="text-[#e4e4e7]">Change Password</h4>

                          {/* New password */}
                          <div>
                            <label className="block text-xs text-[#8b8b9e] mb-1.5">
                              New password <span className="text-[#ef4444]">*</span>
                            </label>
                            <div className="relative">
                              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8b9e]" />
                              <input
                                type={showNewPassword ? 'text' : 'password'}
                                autoFocus
                                autoComplete="new-password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Escape') handleCancelPassword(); }}
                                placeholder="At least 6 characters"
                                className="w-full bg-[#2a2a35] border border-[#3a3a45] rounded-lg pl-10 pr-10 py-2 text-sm text-[#e4e4e7] placeholder:text-[#8b8b9e] focus:outline-none focus:border-[#5b5bd6] transition-colors"
                              />
                              <button
                                type="button"
                                onClick={() => setShowNewPassword(!showNewPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b8b9e] hover:text-[#e4e4e7] transition-colors"
                                tabIndex={-1}
                              >
                                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>

                          {/* Confirm password */}
                          <div>
                            <label className="block text-xs text-[#8b8b9e] mb-1.5">
                              Confirm password <span className="text-[#ef4444]">*</span>
                            </label>
                            <div className="relative">
                              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8b9e]" />
                              <input
                                type={showConfirmPassword ? 'text' : 'password'}
                                autoComplete="new-password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleChangePassword(); if (e.key === 'Escape') handleCancelPassword(); }}
                                placeholder="Same password again"
                                className="w-full bg-[#2a2a35] border border-[#3a3a45] rounded-lg pl-10 pr-10 py-2 text-sm text-[#e4e4e7] placeholder:text-[#8b8b9e] focus:outline-none focus:border-[#5b5bd6] transition-colors"
                              />
                              <button
                                type="button"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b8b9e] hover:text-[#e4e4e7] transition-colors"
                                tabIndex={-1}
                              >
                                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>

                          {/* Error */}
                          {passwordError && (
                            <p className="text-xs text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-lg px-3 py-2">
                              {passwordError}
                            </p>
                          )}

                          {/* Success */}
                          {passwordSuccess && (
                            <p className="text-xs text-[#4ade80] bg-[#4ade80]/10 border border-[#4ade80]/20 rounded-lg px-3 py-2 flex items-center gap-2">
                              <Check className="w-3.5 h-3.5 flex-shrink-0" />
                              Password updated successfully.
                            </p>
                          )}

                          {/* Actions */}
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={handleChangePassword}
                              disabled={passwordSaving || passwordSuccess}
                              className="px-3 py-1.5 bg-[#5b5bd6] hover:bg-[#7c7ce8] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white flex items-center gap-1.5 transition-colors"
                            >
                              {passwordSaving
                                ? <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>
                                : <><Check className="w-3 h-3" /> Update password</>
                              }
                            </button>
                            <button
                              onClick={handleCancelPassword}
                              disabled={passwordSaving}
                              className="px-3 py-1.5 bg-[#2a2a35] hover:bg-[#353545] disabled:opacity-50 rounded-lg text-sm text-[#e4e4e7] transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Danger zone */}
                    <div className="pt-4 border-t border-[#1f1f28]">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="w-4 h-4 text-[#ef4444]" />
                        <h4 className="text-[#e4e4e7]">Danger Zone</h4>
                      </div>
                      <div className="space-y-3">
                        {/* Export — coming soon */}
                        <div className="p-4 bg-[#1f1f28] rounded-xl flex items-start justify-between gap-4 opacity-60">
                          <div>
                            <h5 className="text-[#e4e4e7] mb-1">Export your data</h5>
                            <p className="text-sm text-[#8b8b9e]">
                              Download all your recommendations and watch history
                            </p>
                          </div>
                          <ComingSoon />
                        </div>
                        {/* Delete account — live */}
                        <div className="p-4 bg-[#1f1f28] border border-[#ef4444]/20 rounded-xl">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <h5 className="text-[#ef4444] mb-1">Delete account</h5>
                              <p className="text-sm text-[#8b8b9e]">
                                Permanently removes your profile, friends, recommendations,
                                comfort list, and connected services.
                              </p>
                            </div>
                            <button
                              onClick={() => {
                                setShowDeleteConfirm(true);
                                setDeleteInput('');
                                setDeleteError(null);
                              }}
                              className="px-4 py-2 bg-[#ef4444]/10 hover:bg-[#ef4444]/20 border border-[#ef4444]/30 text-[#ef4444] rounded-lg text-sm flex items-center gap-2 transition-colors flex-shrink-0"
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete Account
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Sign out */}
                    <div className="pt-2">
                      <button
                        onClick={() => supabase.auth.signOut()}
                        className="px-5 py-2.5 bg-[#1f1f28] hover:bg-[#2a2a35] border border-[#2a2a35] rounded-lg text-sm text-[#e4e4e7] transition-colors"
                      >
                        Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </main>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[#1f1f28] flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-[#5b5bd6] hover:bg-[#7c7ce8] rounded-lg text-white transition-colors"
          >
            Done
          </button>
        </div>
      </div>

      {/* ── Delete Account confirmation overlay ────────────────────────────── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-[#0f0f14] border border-[#ef4444]/30 rounded-2xl w-full max-w-md shadow-2xl">
            {/* Header */}
            <div className="flex items-center gap-3 p-6 border-b border-[#1f1f28]">
              <div className="w-10 h-10 bg-[#ef4444]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-[#ef4444]" />
              </div>
              <div>
                <h3 className="text-[#e4e4e7]">Delete Account</h3>
                <p className="text-sm text-[#8b8b9e] mt-0.5">This action cannot be undone</p>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <p className="text-sm text-[#8b8b9e]">
                Deleting your account will permanently remove:
              </p>
              <ul className="text-sm text-[#8b8b9e] space-y-1.5 ml-2">
                {[
                  'Your profile and display name',
                  'All friends and friendship connections',
                  'All pending friend requests',
                  'All recommendations sent and received',
                  'Your comfort list',
                  'Connected streaming services',
                  'Notifications and read/dismissed states',
                  'Your sign-in account (you will be logged out)',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444] flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>

              <div className="pt-2">
                <label className="block text-xs text-[#8b8b9e] mb-1.5">
                  Type <span className="text-[#ef4444] font-mono font-bold">DELETE</span> to confirm
                </label>
                <input
                  type="text"
                  autoFocus
                  value={deleteInput}
                  onChange={(e) => setDeleteInput(e.target.value)}
                  placeholder="DELETE"
                  className="w-full bg-[#1a1a22] border border-[#2a2a35] rounded-lg px-4 py-2.5 text-sm text-[#e4e4e7] placeholder:text-[#8b8b9e] focus:outline-none focus:border-[#ef4444]/60 transition-colors font-mono"
                />
              </div>

              {deleteError && (
                <p className="text-xs text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-lg px-3 py-2">
                  {deleteError}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-[#1f1f28] flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteInput('');
                  setDeleteError(null);
                }}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 bg-[#1f1f28] hover:bg-[#2a2a35] rounded-lg text-sm text-[#e4e4e7] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteInput !== 'DELETE' || deleting}
                className="flex-1 px-4 py-2.5 bg-[#ef4444] hover:bg-[#dc2626] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm text-white transition-colors flex items-center justify-center gap-2"
              >
                {deleting
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting…</>
                  : <><Trash2 className="w-4 h-4" /> Delete Account</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Streaming Service overlay ──────────────────────────────────── */}
      {showAddServiceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-[#0f0f14] border border-[#1f1f28] rounded-xl max-w-2xl w-full max-h-[70vh] flex flex-col">
            <div className="p-6 border-b border-[#1f1f28]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl text-[#e4e4e7]">Add Streaming Service</h3>
                <button
                  onClick={() => {
                    setShowAddServiceModal(false);
                    setServiceSearchQuery('');
                    setConnectServiceError(null);
                  }}
                  className="p-2 text-[#8b8b9e] hover:text-[#e4e4e7] hover:bg-[#1f1f28] rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8b8b9e]" />
                <input
                  type="text"
                  value={serviceSearchQuery}
                  onChange={(e) => setServiceSearchQuery(e.target.value)}
                  placeholder="Search streaming services…"
                  className="w-full pl-11 pr-4 py-3 bg-[#1f1f28] border border-[#2a2a35] rounded-lg text-[#e4e4e7] placeholder-[#8b8b9e] focus:outline-none focus:border-[#5b5bd6]"
                  autoFocus
                />
              </div>
              {connectServiceError && (
                <p className="mt-3 text-sm text-red-400">{connectServiceError}</p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {filteredCatalog.length > 0 ? (
                <div className="space-y-3">
                  {filteredCatalog.map((svc) => {
                    const isConnecting = connectingService === svc.name;
                    return (
                      <div
                        key={svc.name}
                        className="flex items-center justify-between p-4 bg-[#1f1f28] rounded-xl hover:bg-[#2a2a35] transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-[#2a2a35] flex items-center justify-center text-lg font-bold text-[#8b8b9e]">
                            {svc.icon}
                          </div>
                          <div>
                            <div className="text-[#e4e4e7] mb-1">{svc.name}</div>
                            <div className="text-sm text-[#8b8b9e]">Access watch history and availability</div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleConnectService(svc.name)}
                          disabled={isConnecting}
                          className="px-4 py-2 bg-[#5b5bd6] hover:bg-[#7c7ce8] disabled:opacity-50 rounded-lg text-sm transition-colors flex-shrink-0 flex items-center gap-2"
                        >
                          {isConnecting && <Loader2 className="w-3 h-3 animate-spin" />}
                          {isConnecting ? 'Connecting…' : 'Connect'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : catalogNotAdded.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 bg-[#1f1f28] rounded-2xl flex items-center justify-center mb-4">
                    <Shield className="w-8 h-8 text-[#5b5bd6]" />
                  </div>
                  <h4 className="text-[#e4e4e7] mb-2">All services added</h4>
                  <p className="text-sm text-[#8b8b9e] max-w-sm">
                    You've already added all available streaming services.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 bg-[#1f1f28] rounded-2xl flex items-center justify-center mb-4">
                    <Search className="w-8 h-8 text-[#8b8b9e]" />
                  </div>
                  <h4 className="text-[#e4e4e7] mb-2">No services found</h4>
                  <p className="text-sm text-[#8b8b9e] max-w-sm">
                    Try a different search term
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
