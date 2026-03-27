import axios from 'axios';

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'}/api`,
});

export const getApiBaseUrl = () => import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

export const getCameraWebSocketUrl = (enterpriseId = getSelectedEnterpriseId()) => {
  const httpBase = getApiBaseUrl();
  const wsBase = httpBase.startsWith('https://')
    ? httpBase.replace('https://', 'wss://')
    : httpBase.replace('http://', 'ws://');
  return `${wsBase}/ws/enterprise/camera/${enterpriseId}`;
};

export const getSelectedEnterpriseId = () => localStorage.getItem('enterprise-account-id') || 'ent_archies_001';

export const withFallback = async (request, fallback) => {
  try {
    const response = await request();
    return response.data;
  } catch (error) {
    console.warn('API unavailable, using fallback data:', error?.message);
    return fallback;
  }
};

export const extractFilename = (header, fallbackName) => {
  if (!header) return fallbackName;
  const matched = /filename="?([^";]+)"?/i.exec(header);
  return matched?.[1] || fallbackName;
};

export const createMinimalPdfBlob = (lines) => {
  const escape = (text) => text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const stream = [
    'BT',
    '/F1 12 Tf',
    '50 800 Td',
    ...lines.flatMap((line, idx) => (idx === 0 ? [`(${escape(line)}) Tj`] : ['0 -16 Td', `(${escape(line)}) Tj`])),
    'ET',
  ].join('\n');

  const encoder = new TextEncoder();
  const streamBytes = encoder.encode(stream);
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }

  const xrefPos = pdf.length;
  pdf += 'xref\n0 6\n0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
};

export { api };
export default api;
