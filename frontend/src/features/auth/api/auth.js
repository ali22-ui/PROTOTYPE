import { api, withFallback } from '@/lib/api-client';

const fallbackEnterpriseAccounts = {
  accounts: [
    { enterprise_id: 'ent_archies_001', company_name: 'Archies', dashboard_title: 'Archies Enterprise Dashboard - Tourism Analytics Portal', linked_lgu_id: 'lgu_san_pedro_001', logo_url: 'https://placehold.co/96x96/1d4ed8/FFFFFF?text=AR', theme: { sidebar: '#0f172a', accent: '#1d4ed8', surface: '#f8fafc' } },
    { enterprise_id: 'ent_lgu_biz_0001', company_name: 'Jollibee - Pacita', dashboard_title: 'Jollibee - Pacita Enterprise Dashboard - Tourism Analytics Portal', linked_lgu_id: 'lgu_san_pedro_001', logo_url: 'https://placehold.co/96x96/7c3aed/FFFFFF?text=JO', theme: { sidebar: '#111827', accent: '#7c3aed', surface: '#f8fafc' } },
    { enterprise_id: 'ent_lgu_biz_0002', company_name: 'San Pedro Public Market', dashboard_title: 'San Pedro Public Market Enterprise Dashboard - Tourism Analytics Portal', linked_lgu_id: 'lgu_san_pedro_001', logo_url: 'https://placehold.co/96x96/059669/FFFFFF?text=SP', theme: { sidebar: '#1f2937', accent: '#059669', surface: '#f8fafc' } },
    ...Array.from({ length: 7 }, (_, idx) => {
      const number = idx + 3;
      const suffix = String(number).padStart(4, '0');
      const accents = ['ea580c', '0ea5e9', '1d4ed8', '7c3aed', '059669'];
      const accent = accents[idx % accents.length];
      return {
        enterprise_id: `ent_lgu_biz_${suffix}`,
        company_name: `LGU Enterprise ${number}`,
        dashboard_title: `LGU Enterprise ${number} Dashboard - Tourism Analytics Portal`,
        linked_lgu_id: 'lgu_san_pedro_001',
        logo_url: `https://placehold.co/96x96/${accent}/FFFFFF?text=E${number}`,
        theme: { sidebar: '#0f172a', accent: `#${accent}`, surface: '#f8fafc' },
      };
    }),
  ],
};

export const fetchEnterpriseAccounts = async () =>
  withFallback(() => api.get('/enterprise/accounts'), fallbackEnterpriseAccounts);
