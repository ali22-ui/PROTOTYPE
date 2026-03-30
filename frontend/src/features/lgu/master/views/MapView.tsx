import { useEffect, useMemo, useState } from 'react';
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet';
import {
  fetchBarangayEnterpriseNodes,
  fetchBarangaysMapData,
  fetchEnterpriseAnalyticsDetail,
} from '@/features/lgu/master/api/apiService';
import {
  getTunedMarkerCenter,
  MAP_MARKER_STYLE,
  SAN_PEDRO_MAP_BOUNDS,
  SAN_PEDRO_MAP_CENTER,
} from '@/features/lgu/master/config/mapConfig';
import EnterpriseDetailsModal from '@/features/lgu/master/components/EnterpriseDetailsModal';
import type {
  LguBarangay,
  LguBarangaysResponse,
  LguEnterpriseAnalyticsDetail,
  LguEnterpriseAnalyticsSummary,
  LguEnterpriseNode,
} from '@/types';

function FitToSanPedroBounds(): JSX.Element | null {
  const map = useMap();

  useEffect(() => {
    map.fitBounds(SAN_PEDRO_MAP_BOUNDS, { padding: [20, 20] });
  }, [map]);

  return null;
}

function FocusOnSelectedBarangay({ selectedMarkerCenter }: { selectedMarkerCenter: [number, number] | null }): JSX.Element | null {
  const map = useMap();

  useEffect(() => {
    if (!selectedMarkerCenter) {
      return;
    }

    map.flyTo(selectedMarkerCenter, 14.8, {
      duration: 0.6,
    });
  }, [map, selectedMarkerCenter]);

  return null;
}

function toComplianceStatus(status: string): 'Active' | 'Needs Renewal' {
  return status.toLowerCase() === 'active' ? 'Active' : 'Needs Renewal';
}

function trendColor(direction: LguEnterpriseAnalyticsSummary['trendDirection']): string {
  if (direction === 'UP') return 'text-emerald-700';
  if (direction === 'DOWN') return 'text-rose-700';
  return 'text-slate-700';
}

export default function MapView(): JSX.Element {
  const [mapPayload, setMapPayload] = useState<LguBarangaysResponse>({
    barangays: [],
    heatmap: [],
  });
  const [selectedBarangayName, setSelectedBarangayName] = useState<string>('');
  const [enterprises, setEnterprises] = useState<LguEnterpriseNode[]>([]);
  const [analyticsByEnterprise, setAnalyticsByEnterprise] = useState<
    Record<number, LguEnterpriseAnalyticsDetail>
  >({});
  const [selectedEnterpriseId, setSelectedEnterpriseId] = useState<number | null>(null);
  const [isLoadingEnterprises, setIsLoadingEnterprises] = useState<boolean>(false);

  useEffect(() => {
    const loadMap = async (): Promise<void> => {
      const payload = await fetchBarangaysMapData();
      setMapPayload(payload);
      if (payload.barangays.length) {
        setSelectedBarangayName(payload.barangays[0].name);
      }
    };

    void loadMap().catch((error: unknown) => {
      console.error('Failed to load barangay map payload:', error);
    });
  }, []);

  const selectedBarangay = useMemo<LguBarangay | null>(() => {
    return mapPayload.barangays.find((entry) => entry.name === selectedBarangayName) ?? null;
  }, [mapPayload.barangays, selectedBarangayName]);

  const selectedMarkerCenter = useMemo<[number, number] | null>(() => {
    if (!selectedBarangay) {
      return null;
    }

    return getTunedMarkerCenter(selectedBarangay);
  }, [selectedBarangay]);

  const selectedEnterprise = useMemo<LguEnterpriseNode | null>(() => {
    if (!selectedEnterpriseId) {
      return null;
    }

    return enterprises.find((enterprise) => enterprise.id === selectedEnterpriseId) ?? null;
  }, [enterprises, selectedEnterpriseId]);

  useEffect(() => {
    if (!selectedBarangayName) {
      return;
    }

    const loadEnterprises = async (): Promise<void> => {
      setIsLoadingEnterprises(true);
      const payload = await fetchBarangayEnterpriseNodes(selectedBarangayName);
      setEnterprises(payload.enterprises);
      setSelectedEnterpriseId((current) => {
        if (current && payload.enterprises.some((enterprise) => enterprise.id === current)) {
          return current;
        }

        return null;
      });

      const summaries = await Promise.all(
        payload.enterprises.map(async (enterprise) => {
          const summary = await fetchEnterpriseAnalyticsDetail(enterprise.id);
          return [enterprise.id, summary] as const;
        }),
      );

      setAnalyticsByEnterprise(Object.fromEntries(summaries));
      setIsLoadingEnterprises(false);
    };

    void loadEnterprises().catch((error: unknown) => {
      console.error('Failed to load selected barangay enterprises:', error);
      setEnterprises([]);
      setAnalyticsByEnterprise({});
      setSelectedEnterpriseId(null);
      setIsLoadingEnterprises(false);
    });
  }, [selectedBarangayName]);

  return (
    <div className="grid h-[calc(100vh-10.25rem)] min-h-[620px] gap-4 overflow-hidden lg:grid-cols-[1.65fr_1fr]">
      <section className="flex h-full min-h-0 flex-col rounded-2xl border border-brand-light/70 bg-white p-4 shadow-sm">
        <div>
          <h3 className="text-lg font-bold text-brand-dark">
            San Pedro City Barangay Intelligence Map
          </h3>
          <p className="text-sm text-slate-600">
            Accurate 27-barangay interactive map for San Pedro, Laguna (ZIP 4023).
          </p>
        </div>

        <div className="relative z-[400] mt-3 min-h-0 flex-1 overflow-hidden rounded-2xl border border-brand-light/70">
          <MapContainer
            center={SAN_PEDRO_MAP_CENTER}
            zoom={13.1}
            minZoom={12.3}
            maxZoom={17}
            maxBounds={SAN_PEDRO_MAP_BOUNDS}
            maxBoundsViscosity={1}
            className="h-full w-full"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <FitToSanPedroBounds />
            <FocusOnSelectedBarangay selectedMarkerCenter={selectedMarkerCenter} />

            {mapPayload.barangays.map((barangay) => {
              const isSelected = selectedBarangayName === barangay.name;
              const markerCenter = getTunedMarkerCenter(barangay);

              return (
                <CircleMarker
                  key={barangay.id}
                  center={markerCenter}
                  radius={isSelected ? MAP_MARKER_STYLE.selected.radius : MAP_MARKER_STYLE.default.radius}
                  pathOptions={{
                    color: isSelected ? MAP_MARKER_STYLE.selected.color : MAP_MARKER_STYLE.default.color,
                    fillColor: isSelected
                      ? MAP_MARKER_STYLE.selected.fillColor
                      : MAP_MARKER_STYLE.default.fillColor,
                    fillOpacity: isSelected
                      ? MAP_MARKER_STYLE.selected.fillOpacity
                      : MAP_MARKER_STYLE.default.fillOpacity,
                    weight: isSelected ? MAP_MARKER_STYLE.selected.weight : MAP_MARKER_STYLE.default.weight,
                  }}
                  eventHandlers={{
                    click: () => setSelectedBarangayName(barangay.name),
                  }}
                >
                  <Tooltip direction="top" className="!border-0 !bg-white !px-2 !py-1 !text-[11px] !font-semibold !text-brand-dark !shadow-sm">
                    {barangay.name}
                  </Tooltip>
                </CircleMarker>
              );
            })}

          </MapContainer>
        </div>
      </section>

      <aside className="flex h-full min-h-0 flex-col gap-4">
        <section className="rounded-2xl border border-brand-light/70 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-bold uppercase tracking-wide text-brand-dark">Selected Barangay</h4>
          <div className="mt-3">
            <label htmlFor="barangay-select" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Choose Barangay
            </label>
            <select
              id="barangay-select"
              value={selectedBarangayName}
              onChange={(event) => setSelectedBarangayName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-brand-dark focus:border-brand-dark focus:outline-none"
            >
              <option value="" disabled>
                Select a barangay
              </option>
              {mapPayload.barangays.map((barangay) => (
                <option key={barangay.id} value={barangay.name}>
                  {barangay.name}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            {selectedBarangay
              ? `${selectedBarangay.enterpriseCount} registered enterprise account(s)`
              : 'Select a barangay from the dropdown or click a map marker to view linked enterprise nodes.'}
          </p>
        </section>

        <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-brand-light/70 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-bold uppercase tracking-wide text-brand-dark">
            Enterprises in {selectedBarangay?.name || 'Barangay'}
          </h4>

          {isLoadingEnterprises ? (
            <p className="mt-3 text-sm text-slate-600">Loading enterprise records...</p>
          ) : (
            <div className="mt-3 flex-1 overflow-y-auto p-2 pr-1">
              <div className="space-y-2 pb-2">
                {enterprises.map((enterprise) => {
                  const summary = analyticsByEnterprise[enterprise.id];
                  const complianceStatus = toComplianceStatus(enterprise.status);
                  const isSelectedEnterprise = selectedEnterpriseId === enterprise.id;

                  return (
                    <article
                      key={enterprise.id}
                      className={`rounded-xl border border-brand-light/70 bg-white p-3 ${
                        isSelectedEnterprise ? 'ring-2 ring-brand-mid/40' : ''
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedEnterpriseId(enterprise.id)}
                        className="w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-brand-dark">{enterprise.name}</p>
                            <p className="text-xs text-slate-600">
                              {enterprise.barangay} • {enterprise.type}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              complianceStatus === 'Active'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {complianceStatus}
                          </span>
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-700">
                          <div className="rounded-lg bg-white px-2 py-1.5">
                            <p className="text-slate-500">Monthly Visitors</p>
                            <p className="font-semibold text-brand-dark">
                              {(summary?.monthlyVisitors ?? 0).toLocaleString()}
                            </p>
                          </div>
                          <div className="rounded-lg bg-white px-2 py-1.5">
                            <p className="text-slate-500">Top Segment</p>
                            <p className="font-semibold text-brand-dark">{summary?.topDemographic ?? 'N/A'}</p>
                          </div>
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-2">
                          <p className={`text-[11px] font-semibold ${trendColor(summary?.trendDirection ?? 'FLAT')}`}>
                            Trend: {summary?.trendDirection ?? 'FLAT'}
                          </p>
                          <p className="text-[11px] font-semibold text-brand-dark">Click to view full stats</p>
                        </div>
                      </button>
                    </article>
                  );
                })}

                {!enterprises.length ? (
                  <p className="rounded-xl border border-brand-light/70 bg-brand-cream px-3 py-2 text-xs text-slate-600">
                    No enterprise nodes currently linked to this barangay.
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </section>

      </aside>

      <EnterpriseDetailsModal
        enterprise={selectedEnterprise}
        analytics={selectedEnterprise ? analyticsByEnterprise[selectedEnterprise.id] ?? null : null}
        onClose={() => setSelectedEnterpriseId(null)}
      />
    </div>
  );
}
