import axios from 'axios';
import { DashboardData, Indicator } from './types';

const BASE = '/api';

export async function fetchDashboard(): Promise<DashboardData> {
  const res = await axios.get(`${BASE}/index`);
  return res.data;
}

export async function verifyDashboardPassword(password: string): Promise<boolean> {
  await axios.post(`${BASE}/auth/verify`, { password });
  return true;
}

export async function fetchIndicatorDetail(id: string): Promise<Indicator> {
  const res = await axios.get(`${BASE}/indicators/${id}`);
  return res.data;
}

export async function fetchHistory(
  id: string,
  from?: string,
  to?: string
): Promise<{ id: string; history: Indicator['history'] }> {
  const res = await axios.get(`${BASE}/history`, { params: { id, from, to } });
  return res.data;
}

export async function submitManualEntry(
  id: string,
  payload: Record<string, unknown>,
  adminToken: string,
  note?: string
): Promise<void> {
  await axios.post(
    `${BASE}/manual/${id}`,
    { payload, note },
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
}

export async function triggerRefresh(adminToken: string, id?: string): Promise<void> {
  await axios.post(
    `${BASE}/refresh`,
    { id },
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
}

export async function fetchHealth(): Promise<unknown> {
  const res = await axios.get(`${BASE}/health`);
  return res.data;
}

export async function fetchJobs(): Promise<unknown[]> {
  const res = await axios.get(`${BASE}/jobs`);
  return res.data;
}
