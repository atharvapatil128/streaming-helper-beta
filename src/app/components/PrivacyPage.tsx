import React from 'react';

export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e4e4e7]">
      {/* Header bar */}
      <header className="border-b border-[#1f1f28] bg-[#0f0f14] px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src="/helper-active.svg"
              alt="Streaming Helper logo"
              className="h-6 w-6"
            />
            <span className="text-[#e4e4e7] font-semibold">Streaming Helper</span>
          </div>

          <a
            href="/"
            className="text-sm text-[#8b8b9e] hover:text-[#e4e4e7] transition-colors"
          >
            ← Back to app
          </a>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-12 space-y-10">
        <div>
          <h1 className="text-3xl font-bold text-[#e4e4e7] mb-2">Privacy Policy</h1>
          <p className="text-sm text-[#8b8b9e]">Last updated: June 2026 · Beta 1</p>
        </div>

        <Section title="About Streaming Helper">
          <p>
            Streaming Helper is a companion web app and Chrome extension. It helps you
            manage friend recommendations and comfort titles while you browse supported
            streaming sites. This Privacy Policy explains what data is collected, how it
            is used, and what it is not used for.
          </p>
        </Section>

        <Section title="Data We Collect">
          <p className="mb-3">
            When you create an account and use Streaming Helper, the following data is
            collected and stored:
          </p>
          <ul className="space-y-2 list-disc list-inside text-[#c5c5d8]">
            <li><strong className="text-[#e4e4e7]">Email address</strong> — used for authentication.</li>
            <li><strong className="text-[#e4e4e7]">Display name</strong> — shown to you and your friends inside the app.</li>
            <li><strong className="text-[#e4e4e7]">Friend relationships and friend requests</strong> — who you have added and who has added you.</li>
            <li><strong className="text-[#e4e4e7]">Recommendations sent and received</strong> — titles, platforms, and media type.</li>
            <li><strong className="text-[#e4e4e7]">Comfort titles</strong> — titles you have added to your personal Comfort List.</li>
            <li><strong className="text-[#e4e4e7]">Notification read and dismiss state</strong> — which notifications you have read or dismissed, stored persistently so your state is consistent across sessions.</li>
            <li><strong className="text-[#e4e4e7]">Streaming service preferences</strong> — any service entries you have saved in Connected Services settings.</li>
            <li><strong className="text-[#e4e4e7]">Extension session state</strong> — when you sign in through the Chrome extension popup, your session token and user ID are stored locally in Chrome&apos;s extension storage on your device so the helper panel can show your account-specific data.</li>
          </ul>
        </Section>

        <Section title="How We Use Your Data">
          <ul className="space-y-2 list-disc list-inside text-[#c5c5d8]">
            <li>To authenticate you and keep your account secure.</li>
            <li>To display your friends, recommendations, comfort titles, and notifications inside the app.</li>
            <li>To connect the Chrome extension to your Streaming Helper account so the in-page helper panel shows your personalized data.</li>
            <li>To open platform search links and TMDB fallback links when you choose to view a recommended title on a streaming service.</li>
          </ul>
        </Section>

        <Section title="What We Don't Do in Beta 1">
          <ul className="space-y-2 list-disc list-inside text-[#c5c5d8]">
            <li>Streaming Helper <strong className="text-[#e4e4e7]">does not connect</strong> directly to Netflix, Prime Video, Disney+, Hulu, HBO Max, or any other streaming service account.</li>
            <li>Streaming Helper <strong className="text-[#e4e4e7]">does not read or collect</strong> your watch history in Beta 1.</li>
            <li>Streaming Helper <strong className="text-[#e4e4e7]">does not automatically play</strong> titles on any platform.</li>
          </ul>
        </Section>

        <Section title="Data Sharing">
          <p className="mb-3">
            Your data is stored and processed using the following third-party infrastructure
            providers:
          </p>
          <ul className="space-y-2 list-disc list-inside text-[#c5c5d8]">
            <li>
              <strong className="text-[#e4e4e7]">Supabase</strong> — database, authentication,
              and serverless edge functions. Your data is stored in Supabase&apos;s hosted
              Postgres database with Row Level Security enforced.
            </li>
            <li>
              <strong className="text-[#e4e4e7]">Vercel</strong> — web app hosting and deployment.
            </li>
          </ul>
          <p className="mt-3">
            Your data is <strong className="text-[#e4e4e7]">not sold</strong> to any third party.
            It is not used for advertising.
          </p>
        </Section>

        <Section title="Chrome Extension Local Storage">
          <p>
            When you sign in through the Streaming Helper Chrome extension popup, your
            session credentials (access token, refresh token, user ID, and email) are
            stored locally in <strong className="text-[#e4e4e7]">Chrome&apos;s extension storage</strong>
            {' '}(<code className="bg-[#1f1f28] px-1 rounded text-xs">chrome.storage.local</code>) on your device.
            This data never leaves your browser except to communicate with Supabase to fetch
            your recommendations and comfort titles. It is cleared when you disconnect from
            the extension popup.
          </p>
        </Section>

        <Section title="Account Deletion">
          <p>
            You can delete your Streaming Helper account at any time from{' '}
            <strong className="text-[#e4e4e7]">Settings → Account → Danger Zone</strong>.
            Deleting your account permanently removes all app data associated with your profile,
            including friends, recommendations, comfort titles, notifications, and service
            preferences, as well as the authentication account itself.
          </p>
        </Section>

        <Section title="Limited Use Disclosure">
          <p>
            Streaming Helper&apos;s use of data from your account is limited to providing and
            improving the Streaming Helper service. Your data is not used for advertising,
            is not sold, and is not transferred to third parties except as necessary to
            provide the service (Supabase, Vercel) or to comply with applicable law.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            If you have questions or concerns about this Privacy Policy or how your data is
            handled, please contact:
          </p>
          <p className="mt-2">
            <a
              href="mailto:atharvapatil128@gmail.com"
              className="text-[#7c7ce8] hover:text-[#a0a0f0] underline underline-offset-2 transition-colors"
            >
              atharvapatil128@gmail.com
            </a>
          </p>
        </Section>

        <p className="text-xs text-[#4a4a5a] pt-4 border-t border-[#1f1f28]">
          This policy applies to Streaming Helper Beta 1. It will be updated as the product
          evolves.
        </p>

        <p className="text-xs text-[#3a3a48] pt-6 border-t border-[#1a1a22]">
          &copy; 2026 Atharva Patil. All rights reserved.
        </p>
      </main>
    </div>
  );
}

/* ── Local helper ─────────────────────────────────────────────────────────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-[#e4e4e7] border-b border-[#1f1f28] pb-2">
        {title}
      </h2>
      <div className="text-[#c5c5d8] leading-relaxed text-sm space-y-2">
        {children}
      </div>
    </section>
  );
}
