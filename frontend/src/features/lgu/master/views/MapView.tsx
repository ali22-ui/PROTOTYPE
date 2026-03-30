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
  const [expandedEnterpriseId, setExpandedEnterpriseId] = useState<number | null>(null);
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

  useEffect(() => {
    if (!selectedBarangayName) {
      return;
    }

    const loadEnterprises = async (): Promise<void> => {
      setIsLoadingEnterprises(true);
      const payload = await fetchBarangayEnterpriseNodes(selectedBarangayName);
      setEnterprises(payload.enterprises);
      setExpandedEnterpriseId((current) => {
        if (current && payload.enterprises.some((enterprise) => enterprise.id === current)) {
          return current;
        }

        return payload.enterprises[0]?.id ?? null;
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
      setExpandedEnterpriseId(null);
      setIsLoadingEnterprises(false);
    });
  }, [selectedBarangayName]);

  return (
    <div className="grid min-h-full gap-4 xl:grid-cols-[1.65fr_1fr]">
      <section className="grid min-h-full rounded-2xl border border-brand-light/70 bg-white p-4 shadow-sm">
        <div>
          <h3 className="text-lg font-bold text-brand-dark">
            San Pedro City Barangay Intelligence Map
          </h3>
          <p className="text-sm text-slate-600">
            Accurate 27-barangay interactive map for San Pedro, Laguna (ZIP 4023).
          </p>
        </div>

        <div className="mt-3 min-h-[620px] overflow-hidden rounded-2xl border border-brand-light/70">
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

      <aside className="grid min-h-full gap-4">
        <section className="rounded-2xl border border-brand-light/70 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-bold uppercase tracking-wide text-brand-dark">Selected Barangay</h4>
          <p className="mt-1 text-lg font-bold text-brand-dark">
            {selectedBarangay?.name || 'Select a barangay'}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {selectedBarangay
              ? `${selectedBarangay.enterpriseCount} registered enterprise account(s)`
              : 'Click a barangay in the map to view linked enterprise nodes.'}
          </p>
        </section>

        <section className="rounded-2xl border border-brand-light/70 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-bold uppercase tracking-wide text-brand-dark">
            Enterprises in {selectedBarangay?.name || 'Barangay'}
          </h4>

          {isLoadingEnterprises ? (
            <p className="mt-3 text-sm text-slate-600">Loading enterprise records...</p>
          ) : (
            <div className="mt-3 max-h-[320px] space-y-2 overflow-y-auto pr-1">
              {enterprises.map((enterprise) => {
                const summary = analyticsByEnterprise[enterprise.id];
                const complianceStatus = toComplianceStatus(enterprise.status);
                const isExpanded = expandedEnterpriseId === enterprise.id;

                return (
                  <article
                    key={enterprise.id}
                    className="rounded-xl border border-brand-light/70 bg-brand-cream p-3"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedEnterpriseId((current) =>
                          current === enterprise.id ? null : enterprise.id,
                        );
                      }}
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

                      <p className={`mt-2 text-[11px] font-semibold ${trendColor(summary?.trendDirection ?? 'FLAT')}`}>
                        Trend: {summary?.trendDirection ?? 'FLAT'}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {isExpanded ? 'Click to collapse deep stats' : 'Click to expand deep stats'}
                      </p>
                    </button>

                    {isExpanded ? (
                      summary ? (
                        <div className="mt-3 rounded-lg border border-brand-light/70 bg-white p-2.5 text-[11px] text-slate-700">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-md bg-brand-cream px-2 py-1.5">
                              <p className="text-slate-500">Total Tourists</p>
                              <p className="font-semibold text-brand-dark">
                                {summary.totalTourists.toLocaleString()}
                              </p>
                            </div>
                            <div className="rounded-md bg-brand-cream px-2 py-1.5">
                              <p className="text-slate-500">Local / Non-Local</p>
                              <p className="font-semibold text-brand-dark">
                                {summary.localResidents.toLocaleString()} / {summary.nonLocalResidents.toLocaleString()}
                              </p>
                            </div>
                            <div className="rounded-md bg-brand-cream px-2 py-1.5">
                              <p className="text-slate-500">Male Ratio</p>
                              <p className="font-semibold text-brand-dark">{summary.maleRatioPct}%</p>
                            </div>
                            <div className="rounded-md bg-brand-cream px-2 py-1.5">
                              <p className="text-slate-500">Female Ratio</p>
                              <p className="font-semibold text-brand-dark">{summary.femaleRatioPct}%</p>
                            </div>
                          </div>

                          <div className="mt-2 rounded-md border border-brand-light/60 bg-brand-cream/70 px-2 py-2">
                            <p className="font-semibold text-brand-dark">Visitor Demographics</p>
                            <ul className="mt-1 space-y-0.5">
                              {summary.demographics.map((entry) => (
                                <li key={`${enterprise.id}-${entry.name}`} className="flex items-center justify-between gap-2">
                                  <span>{entry.name}</span>
                                  <span className="font-semibold text-brand-dark">{entry.value.toLocaleString()}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 rounded-md bg-white px-2 py-1.5 text-[11px] text-slate-600">
                          Loading deep stats...
                        </p>
                      )
                    ) : null}
                  </article>
                );
              })}

              {!enterprises.length ? (
                <p className="rounded-xl border border-brand-light/70 bg-brand-cream px-3 py-2 text-xs text-slate-600">
                  No enterprise nodes currently linked to this barangay.
                </p>
              ) : null}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-brand-light/70 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-bold uppercase tracking-wide text-brand-dark">Barangay Directory (27)</h4>
          <div className="mt-3 max-h-[280px] space-y-1.5 overflow-y-auto pr-1">
            {mapPayload.barangays.map((barangay) => (
              <button
                key={barangay.id}
                type="button"
                onClick={() => setSelectedBarangayName(barangay.name)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                  selectedBarangayName === barangay.name
                    ? 'border-brand-dark bg-brand-light/40 text-brand-dark'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-brand-cream'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{barangay.name}</span>
                  <span className="text-[11px] text-slate-500">{barangay.enterpriseCount}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}
