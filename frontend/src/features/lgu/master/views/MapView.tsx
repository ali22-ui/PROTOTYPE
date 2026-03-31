import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Feature, GeoJsonObject } from 'geojson';
import * as L from 'leaflet';
import type { Layer, LeafletMouseEvent, PathOptions } from 'leaflet';
import {
  GeoJSON,
  MapContainer,
  TileLayer,
  useMap,
} from 'react-leaflet';
import {
  fetchBarangayEnterpriseNodes,
  fetchBarangaysMapData,
  fetchEnterpriseAnalyticsDetail,
  fetchMapBoundaries,
} from '@/features/lgu/master/api/apiService';
import {
  SAN_PEDRO_MAP_BOUNDS,
  SAN_PEDRO_MAP_CENTER,
} from '@/features/lgu/master/config/mapConfig';
import EnterpriseDetailsModal from '@/features/lgu/master/components/EnterpriseDetailsModal';
import type {
  EnterpriseMapNode,
  LguBarangay,
  LguBarangaysGeoJsonResponse,
  LguBarangaysResponse,
} from '@/types';

const normalizeBarangayName = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\./g, '')
    .replace(/[^a-z0-9]/g, '');

const PREMIUM_BARANGAY_COLORS: Record<string, string> = {
  sanantonio: '#5C6F2B',
  pacitai: '#DE802B',
  landayan: '#D8C9A7',
  pacitaii: '#A2D9A1',
  poblacion: '#F6F1D1',
  sanroque: '#B5D1FF',
  sanvicente: '#FFC8A2',
  sampaguitavillage: '#DCCCF5',
  bagongsilang: '#C7E9F1',
  cuyab: '#BDE0B0',
};

const FALLBACK_PASTEL_COLORS = ['#A2D9A1', '#F6F1D1', '#B5D1FF', '#FFC8A2', '#DCCCF5', '#C7E9F1'];

const resolveBarangayColor = (barangayName: string): string => {
  const normalized = normalizeBarangayName(barangayName);
  if (!normalized) {
    return '#D8C9A7';
  }

  const mapped = PREMIUM_BARANGAY_COLORS[normalized];
  if (mapped) {
    return mapped;
  }

  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(index);
    hash |= 0;
  }

  return FALLBACK_PASTEL_COLORS[Math.abs(hash) % FALLBACK_PASTEL_COLORS.length];
};

const getFeatureBarangayName = (feature?: Feature): string => {
  const properties = feature?.properties;
  if (!properties || typeof properties !== 'object') {
    return '';
  }

  const maybeName = (properties as { name?: unknown }).name;
  return typeof maybeName === 'string' ? maybeName : '';
};

function FitToGeoJsonBounds({ geojson }: { geojson: GeoJsonObject | null }): JSX.Element | null {
  const map = useMap();

  useEffect(() => {
    if (!geojson) {
      return;
    }

    const layer = L.geoJSON(geojson);
    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [geojson, map]);

  return null;
}

function FocusOnSelectedBoundary({
  boundariesPayload,
  selectedBarangayName,
}: {
  boundariesPayload: LguBarangaysGeoJsonResponse | null;
  selectedBarangayName: string;
}): JSX.Element | null {
  const map = useMap();

  useEffect(() => {
    if (!boundariesPayload || !selectedBarangayName) {
      return;
    }

    const selectedKey = normalizeBarangayName(selectedBarangayName);
    const matched = boundariesPayload.features.find(
      (feature) => normalizeBarangayName(feature.properties?.name || '') === selectedKey,
    );

    if (!matched) {
      return;
    }

    const layer = L.geoJSON(matched as unknown as GeoJsonObject);
    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      map.flyToBounds(bounds, {
        duration: 0.6,
        maxZoom: 15.4,
        padding: [26, 26],
      });
    }
  }, [boundariesPayload, map, selectedBarangayName]);

  return null;
}

function toComplianceStatus(status: string): 'Active' | 'Needs Renewal' {
  return status.toLowerCase() === 'active' ? 'Active' : 'Needs Renewal';
}

function trendColor(direction: NonNullable<EnterpriseMapNode['currentMonthStats']>['trend']): string {
  if (direction === 'UP') return 'text-emerald-700';
  if (direction === 'DOWN') return 'text-rose-700';
  return 'text-slate-700';
}

export default function MapView(): JSX.Element {
  const [mapPayload, setMapPayload] = useState<LguBarangaysResponse>({
    barangays: [],
    heatmap: [],
  });
  const [boundariesPayload, setBoundariesPayload] = useState<LguBarangaysGeoJsonResponse | null>(null);
  const [selectedBarangayName, setSelectedBarangayName] = useState<string>('');
  const [enterprises, setEnterprises] = useState<EnterpriseMapNode[]>([]);
  const [selectedEnterpriseId, setSelectedEnterpriseId] = useState<string | null>(null);
  const [isLoadingEnterprises, setIsLoadingEnterprises] = useState<boolean>(false);

  useEffect(() => {
    const loadMap = async (): Promise<void> => {
      const [payload, boundaries] = await Promise.all([
        fetchBarangaysMapData(),
        fetchMapBoundaries(),
      ]);

      setMapPayload(payload);
      setBoundariesPayload(boundaries);

      const boundaryNames = boundaries.features
        .map((feature) => feature.properties?.name)
        .filter((name): name is string => Boolean(name));

      setSelectedBarangayName((current) => {
        const currentKey = normalizeBarangayName(current);
        if (currentKey && boundaryNames.some((name) => normalizeBarangayName(name) === currentKey)) {
          return current;
        }

        return boundaryNames[0] || payload.barangays[0]?.name || '';
      });
    };

    void loadMap().catch((error: unknown) => {
      console.error('Failed to load map boundaries payload:', error);
    });
  }, []);

  const geoJsonData = useMemo<GeoJsonObject | null>(() => {
    return boundariesPayload as unknown as GeoJsonObject;
  }, [boundariesPayload]);

  const selectableBarangays = useMemo<string[]>(() => {
    if (!boundariesPayload) {
      return mapPayload.barangays.map((barangay) => barangay.name);
    }

    const seen = new Set<string>();
    const names: string[] = [];

    boundariesPayload.features.forEach((feature) => {
      const name = feature.properties?.name;
      if (!name) {
        return;
      }

      const key = normalizeBarangayName(name);
      if (!seen.has(key)) {
        seen.add(key);
        names.push(name);
      }
    });

    return names;
  }, [boundariesPayload, mapPayload.barangays]);

  const selectedBarangay = useMemo<LguBarangay | null>(() => {
    const selectedKey = normalizeBarangayName(selectedBarangayName);
    if (!selectedKey) {
      return null;
    }

    return (
      mapPayload.barangays.find((entry) => normalizeBarangayName(entry.name) === selectedKey)
      ?? null
    );
  }, [mapPayload.barangays, selectedBarangayName]);

  const polygonStyle = useCallback(
    (feature?: Feature): PathOptions => {
      const name = getFeatureBarangayName(feature);

      return {
        color: '#1F2937',
        weight: 1,
        fillColor: resolveBarangayColor(name),
        fillOpacity: 0.7,
      };
    },
    [],
  );

  const onEachBoundaryFeature = useCallback(
    (feature: Feature, layer: Layer): void => {
      const name = getFeatureBarangayName(feature);
      if (!name) {
        return;
      }

      if ('bindTooltip' in layer && typeof layer.bindTooltip === 'function') {
        layer.bindTooltip(name, {
          direction: 'top',
          sticky: true,
          opacity: 0.95,
        });
      }

      layer.on({
        mouseover: (event: LeafletMouseEvent) => {
          const target = event.target as L.Path;
          target.setStyle({ fillOpacity: 0.9 });
          target.bringToFront();
        },
        mouseout: (event: LeafletMouseEvent) => {
          const target = event.target as L.Path;
          target.setStyle({ fillOpacity: 0.7 });
        },
        click: () => {
          setSelectedBarangayName(name);
        },
      });
    },
    [],
  );

  const selectedEnterprise = useMemo<EnterpriseMapNode | null>(() => {
    if (!selectedEnterpriseId) {
      return null;
    }

    return enterprises.find((enterprise) => enterprise.id === selectedEnterpriseId) ?? null;
  }, [enterprises, selectedEnterpriseId]);

  const selectedBarangayQueryName = selectedBarangay?.name || selectedBarangayName;

  useEffect(() => {
    if (!selectedBarangayQueryName) {
      return;
    }

    const loadEnterprises = async (): Promise<void> => {
      setIsLoadingEnterprises(true);
      const payload = await fetchBarangayEnterpriseNodes(selectedBarangayQueryName);

      const mappedEnterprises = await Promise.all(
        payload.enterprises.map(async (enterprise) => {
          const detail = await fetchEnterpriseAnalyticsDetail(enterprise.id).catch(() => null);

          const currentMonthStats = detail
            ? {
              visitors: detail.monthlyVisitors,
              topSegment: detail.topDemographic,
              trend: detail.trendDirection,
              demographics: detail.demographics,
              totalTourists: detail.totalTourists,
              localResidents: detail.localResidents,
              nonLocalResidents: detail.nonLocalResidents,
              maleRatioPct: detail.maleRatioPct,
              femaleRatioPct: detail.femaleRatioPct,
            }
            : null;

          return {
            id: enterprise.id.toString(),
            name: enterprise.name,
            category: enterprise.type,
            status: toComplianceStatus(enterprise.status),
            barangay: enterprise.barangay,
            businessId: enterprise.businessId,
            currentMonthStats,
          } satisfies EnterpriseMapNode;
        }),
      );

      setEnterprises(mappedEnterprises);
      setSelectedEnterpriseId((current) => {
        if (current && mappedEnterprises.some((enterprise) => enterprise.id === current)) {
          return current;
        }

        return null;
      });
      setIsLoadingEnterprises(false);
    };

    void loadEnterprises().catch((error: unknown) => {
      console.error('Failed to load selected barangay enterprises:', error);
      setEnterprises([]);
      setSelectedEnterpriseId(null);
      setIsLoadingEnterprises(false);
    });
  }, [selectedBarangayQueryName]);

  return (
    <div className="grid h-[calc(100vh-10.25rem)] min-h-[620px] gap-4 overflow-hidden lg:grid-cols-[1.65fr_1fr]">
      <section className="flex h-full min-h-0 flex-col rounded-2xl border border-brand-light/70 bg-white p-4 shadow-sm">
        <div>
          <h3 className="text-lg font-bold text-brand-dark">
            San Pedro City Barangay Intelligence Map
          </h3>
          <p className="text-sm text-slate-600">
            High-fidelity boundary rendering for San Pedro, Laguna (ZIP 4023).
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

            <FitToGeoJsonBounds geojson={geoJsonData} />
            <FocusOnSelectedBoundary
              boundariesPayload={boundariesPayload}
              selectedBarangayName={selectedBarangayName}
            />

            {geoJsonData ? (
              <GeoJSON
                key={`${selectedBarangayName}-${selectableBarangays.join('|')}`}
                data={geoJsonData}
                style={polygonStyle}
                onEachFeature={onEachBoundaryFeature}
              />
            ) : null}
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
              {selectableBarangays.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            {selectedBarangayName
              ? `${selectedBarangay?.enterpriseCount ?? 0} registered enterprise account(s)`
              : 'Select a barangay from the dropdown or click a map boundary to view linked enterprise nodes.'}
          </p>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-cream px-2 py-0.5">
              <span className="h-2 w-2 rounded-full bg-[#5C6F2B]" />
              Core Zone
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-orange-700">
              <span className="h-2 w-2 rounded-full bg-[#DE802B]" />
              Commercial Belt
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
              <span className="h-2 w-2 rounded-full bg-[#D8C9A7]" />
              Residential / Mixed
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-[#A2D9A1]" />
              Green Transitional
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-yellow-700">
              <span className="h-2 w-2 rounded-full bg-[#F6F1D1]" />
              Peripheral Cluster
            </span>
          </div>
        </section>

        <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-brand-light/70 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-bold uppercase tracking-wide text-brand-dark">
            Enterprises in {selectedBarangayName || 'Barangay'}
          </h4>

          {isLoadingEnterprises ? (
            <p className="mt-3 text-sm text-slate-600">Loading enterprise records...</p>
          ) : (
            <div className="mt-3 flex-1 overflow-y-auto p-2 pr-1">
              <div className="space-y-2 pb-2">
                {enterprises.map((enterprise) => {
                  const stats = enterprise.currentMonthStats ?? null;
                  const complianceStatus = enterprise.status;
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
                              {enterprise.barangay} • {enterprise.category}
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

                        {stats ? (
                          <>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-700">
                              <div className="rounded-lg bg-white px-2 py-1.5">
                                <p className="text-slate-500">Monthly Visitors</p>
                                <p className="font-semibold text-brand-dark">{stats.visitors.toLocaleString()}</p>
                              </div>
                              <div className="rounded-lg bg-white px-2 py-1.5">
                                <p className="text-slate-500">Top Segment</p>
                                <p className="font-semibold text-brand-dark">{stats.topSegment}</p>
                              </div>
                            </div>

                            <div className="mt-2 flex items-center justify-between gap-2">
                              <p className={`text-[11px] font-semibold ${trendColor(stats.trend)}`}>
                                Trend: {stats.trend}
                              </p>
                              <p className="text-[11px] font-semibold text-brand-dark">Click to view full stats</p>
                            </div>
                          </>
                        ) : (
                          <>
                            <p className="text-sm text-brand-mid/80 italic py-4 text-center">No report data submitted for this period.</p>
                            <div className="mt-1 flex items-center justify-end gap-2">
                              <p className="text-[11px] font-semibold text-brand-dark">Click to view account details</p>
                            </div>
                          </>
                        )}
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
        onClose={() => setSelectedEnterpriseId(null)}
      />
    </div>
  );
}
