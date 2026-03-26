import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CityMap from '../components/CityMap';
import { fetchBarangayEnterprises, fetchBarangays } from '../services/api';

export default function MapView() {
  const navigate = useNavigate();
  const [mapData, setMapData] = useState({ barangays: [], heatmap: [] });
  const [selectedBarangay, setSelectedBarangay] = useState(null);
  const [enterprises, setEnterprises] = useState([]);

  useEffect(() => {
    fetchBarangays()
      .then((data) => {
        setMapData(data);
        if (data.barangays?.length) {
          setSelectedBarangay(data.barangays[0]);
        }
      })
      .catch((error) => {
        console.error('Failed to load barangays:', error);
      });
  }, []);

  useEffect(() => {
    if (!selectedBarangay) return;

    fetchBarangayEnterprises(selectedBarangay.name)
      .then((data) => {
        setEnterprises(data.enterprises);
      })
      .catch((error) => {
        console.error('Failed to load barangay enterprises:', error);
      });
  }, [selectedBarangay]);

  const panelTitle = useMemo(
    () =>
      selectedBarangay
        ? `Barangay ${selectedBarangay.name} - Enterprises`
        : 'Select a barangay to view local enterprises',
    [selectedBarangay]
  );

  const cityCenter = { lat: 14.3315, lng: 121.0415 };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2">
          <h3 className="text-lg font-semibold">San Pedro City Map View</h3>
          <p className="text-sm text-slate-500">Heatmap-only view anchored to official barangay coordinate points.</p>
        </div>
        <CityMap
          barangays={mapData.barangays}
          heatmap={mapData.heatmap}
          showHeatmap
          showPolygons={false}
          showBarangayMarkers={false}
          boundaryMode={false}
          showBarangayLabels={false}
          fitToBarangays={false}
          center={cityCenter}
          zoom={12.9}
          selectedBarangay={selectedBarangay}
          onBarangayClick={setSelectedBarangay}
          className="h-[620px] w-full"
        />
      </section>

      <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h4 className="text-sm font-semibold text-slate-800">{panelTitle}</h4>

        <div className="mt-3 space-y-2">
          {mapData.barangays.map((barangay) => (
            <button
              key={barangay.id}
              type="button"
              onClick={() => setSelectedBarangay(barangay)}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                selectedBarangay?.id === barangay.id
                  ? 'border-primary-600 bg-primary-50 text-primary-900'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{barangay.name}</span>
                <span className="text-xs text-slate-500">{barangay.enterpriseCount || 0} biz</span>
              </div>
            </button>
          ))}
        </div>

        {selectedBarangay && (
          <>
            <div className="mt-4 border-t border-slate-200 pt-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Enterprises</p>
            </div>
            {enterprises.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No enterprise records for this barangay.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {enterprises.slice(0, 6).map((enterprise) => (
                  <li key={enterprise.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <p className="text-sm font-semibold text-slate-800">{enterprise.name}</p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-600">{enterprise.type}</p>
                      <button
                        type="button"
                        onClick={() => navigate(`/app/enterprise/${enterprise.id}`)}
                        className="rounded-md bg-primary-600 px-2 py-1 text-xs font-semibold text-white hover:bg-primary-700"
                      >
                        View
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
