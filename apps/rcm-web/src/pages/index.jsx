import { useState, useEffect } from 'react';

export default function Dashboard() {
  const [health, setHealth] = useState(null);
  const [locale, setLocale] = useState('ar');

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/health`)
      .then(r => r.json())
      .then(setHealth)
      .catch(() => setHealth({ status: 'offline' }));
  }, []);

  const labels = {
    ar: { title: 'نظام إدارة المطالبات', status: 'الحالة', claims: 'المطالبات', compliance: 'الامتثال' },
    en: { title: 'Claims Management', status: 'Status', claims: 'Claims', compliance: 'Compliance' },
  }[locale];

  return (
    <div dir={locale === 'ar' ? 'rtl' : 'ltr'} className="min-h-screen bg-slate-900 text-white p-8">
      <header className="mb-8 flex justify-between items-center">
        <h1 className="text-3xl font-bold text-sky-400">BrainSAIT — {labels.title}</h1>
        <button onClick={() => setLocale(l => l === 'ar' ? 'en' : 'ar')}
          className="bg-slate-700 px-4 py-2 rounded-lg text-sm">
          {locale === 'ar' ? 'English' : 'عربي'}
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard title={labels.status} value={health?.status ?? '...'} color="sky" />
        <StatCard title={labels.claims} value="0" color="emerald" />
        <StatCard title={labels.compliance} value="NPHIES ✓" color="violet" />
      </div>

      <div className="bg-slate-800 rounded-xl p-6">
        <p className="text-slate-400 text-sm">
          API: {process.env.NEXT_PUBLIC_API_URL}
        </p>
      </div>
    </div>
  );
}

function StatCard({ title, value, color }) {
  return (
    <div className={`bg-slate-800 border border-slate-700 rounded-xl p-6`}>
      <p className="text-slate-400 text-sm uppercase tracking-wider">{title}</p>
      <p className={`text-2xl font-bold mt-2 text-${color}-400`}>{value}</p>
    </div>
  );
}
