import { GoogleMap, HeatmapLayer, InfoWindow, Marker, Polygon, useJsApiLoader } from '@react-google-maps/api';
import { useMemo, useState } from 'react';

const defaultCenter = { lat: 14.3413, lng: 121.0446 };
const sanPedroBounds = {
  north: 14.379,
  south: 14.274,
  east: 121.091,
  west: 120.985,
};

const libraries = ['visualization'];

const mapOptions = {
  fullscreenControl: false,
  mapTypeControl: false,
  streetViewControl: false,
  gestureHandling: 'greedy',
  minZoom: 12.5,
  maxZoom: 17,
  restriction: {
    latLngBounds: sanPedroBounds,
    strictBounds: true,
  },
};

export default function CityMap({
  barangays = [],
  heatmap = [],
  selectedBarangay,
  onBarangayClick,
  className = 'h-[460px] w-full',
  showHeatmap = false,
  enterpriseMarkers = [],
  showPolygons = true,
  showBarangayMarkers = false,
  center,
  zoom = 13.3,
  boundaryMode = false,
  showBarangayLabels = false,
  fitToBarangays = false,
}) {
  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  const [hoveredBarangay, setHoveredBarangay] = useState(null);

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'lgu-city-map',
    googleMapsApiKey,
    libraries,
  });

  const heatmapData = useMemo(() => {
    if (!isLoaded || !window.google || !showHeatmap) return [];

    return heatmap.map((point) => ({
      location: new window.google.maps.LatLng(point.lat, point.lng),
      weight: point.weight,
    }));
  }, [heatmap, isLoaded, showHeatmap]);

  const getPolygonCenter = (barangay) => {
    if (barangay.center) return barangay.center;
    const total = barangay.coordinates.reduce(
      (acc, point) => ({ lat: acc.lat + point.lat, lng: acc.lng + point.lng }),
      { lat: 0, lng: 0 }
    );

    return {
      lat: total.lat / barangay.coordinates.length,
      lng: total.lng / barangay.coordinates.length,
    };
  };

  if (!googleMapsApiKey || googleMapsApiKey.includes('YOUR_GOOGLE_MAPS_API_KEY_HERE')) {
    return (
      <div className={`grid place-items-center rounded-xl border border-dashed border-slate-300 bg-white ${className}`}>
        <div className="max-w-md p-6 text-center text-sm text-slate-600">
          <p className="mb-2 text-base font-semibold text-slate-800">Google Maps API key required</p>
          <p>
            Set <code>VITE_GOOGLE_MAPS_API_KEY</code> in your environment file to render the real San Pedro City
            map and barangay polygons.
          </p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={`grid place-items-center rounded-xl border border-red-200 bg-red-50 ${className}`}>
        <p className="text-sm text-red-600">Failed to load Google Maps. Please verify your API key and internet connection.</p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className={`grid place-items-center rounded-xl border border-slate-200 bg-white ${className}`}>
        <p className="text-sm text-slate-600">Loading map…</p>
      </div>
    );
  }

  const pastelPalette = [
    '#b7d3f2', '#f9d5dc', '#f8eac2', '#d9f3dd', '#e6d3f9', '#ffd9b8', '#d5f0f2', '#f5d2ff',
    '#cfe7ff', '#ffeec0', '#d8f8ea', '#f9d7cd', '#d7d5ff', '#f7f4be', '#eed8ff', '#c6eef7',
  ];

  const boundaryOptions = {
    ...mapOptions,
    styles: [
      { featureType: 'poi', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', stylers: [{ visibility: 'off' }] },
      { featureType: 'administrative', stylers: [{ visibility: 'off' }] },
    ],
  };

  const activeOptions = boundaryMode ? boundaryOptions : mapOptions;

  const handleMapLoad = (map) => {
    if (!fitToBarangays || !barangays.length) return;
    const bounds = new window.google.maps.LatLngBounds();
    barangays.forEach((barangay) => {
      barangay.coordinates.forEach((point) => bounds.extend(point));
    });
    map.fitBounds(bounds, 24);
  };

  return (
    <GoogleMap
      zoom={zoom}
      center={center || defaultCenter}
      mapContainerClassName={`${className} rounded-xl`}
      options={activeOptions}
      onLoad={handleMapLoad}
    >
      {showHeatmap && heatmapData.length > 0 && (
        <HeatmapLayer
          data={heatmapData}
          options={{
            radius: 58,
            opacity: 0.52,
            maxIntensity: 10,
            gradient: [
              'rgba(30,58,138,0)',
              'rgba(59,130,246,0.20)',
              'rgba(37,99,235,0.35)',
              'rgba(147,197,253,0.48)',
              'rgba(251,191,36,0.68)',
              'rgba(245,158,11,0.78)',
            ],
          }}
        />
      )}

      {showPolygons &&
        barangays.map((barangay, index) => {
        const isSelected = selectedBarangay?.id === barangay.id;

        return (
          <Polygon
            key={barangay.id}
            paths={barangay.coordinates}
            onClick={() => onBarangayClick?.(barangay)}
            onMouseOver={() => setHoveredBarangay(barangay)}
            onMouseOut={() => setHoveredBarangay(null)}
            options={{
              fillColor: boundaryMode
                ? pastelPalette[index % pastelPalette.length]
                : isSelected
                  ? '#1d4ed8'
                  : '#60a5fa',
              fillOpacity: boundaryMode ? 0.62 : isSelected ? 0.45 : 0.2,
              strokeColor: boundaryMode ? '#1f2937' : '#1e3a8a',
              strokeOpacity: 0.9,
              strokeWeight: boundaryMode ? 1.8 : isSelected ? 3 : 2,
            }}
          />
        );
        })}

      {showBarangayLabels &&
        barangays.map((barangay) => {
          const position = getPolygonCenter(barangay);
          return (
            <Marker
              key={`label-${barangay.id}`}
              position={position}
              label={{
                text: barangay.name.toUpperCase(),
                color: '#111827',
                fontSize: '11px',
                fontWeight: '700',
              }}
              icon={{
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 0,
                fillOpacity: 0,
                strokeOpacity: 0,
              }}
              clickable={false}
            />
          );
        })}

      {showBarangayMarkers &&
        barangays.map((barangay) => {
          const position = getPolygonCenter(barangay);
          return (
            <Marker
              key={`marker-${barangay.id}`}
              position={position}
              onClick={() => onBarangayClick?.(barangay)}
              title={barangay.name}
              icon={{
                path: window.google.maps.SymbolPath.CIRCLE,
                fillColor: selectedBarangay?.id === barangay.id ? '#f4b400' : '#1e3a8a',
                fillOpacity: 0.95,
                strokeColor: '#ffffff',
                strokeWeight: 1.8,
                scale: selectedBarangay?.id === barangay.id ? 7 : 5,
              }}
            />
          );
        })}

      {enterpriseMarkers.map((marker) => (
        <Marker
          key={marker.id}
          position={{ lat: marker.lat, lng: marker.lng }}
          title={marker.name}
          icon={{
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: '#f4b400',
            fillOpacity: 0.95,
            strokeColor: '#0b1f52',
            strokeWeight: 1.5,
            scale: 5,
          }}
        />
      ))}

      {hoveredBarangay && (
        <InfoWindow position={getPolygonCenter(hoveredBarangay)} onCloseClick={() => setHoveredBarangay(null)}>
          <div className="min-w-[180px] p-1 text-slate-800">
            <p className="text-sm font-semibold">{hoveredBarangay.name}</p>
            <p className="text-xs text-slate-600">San Pedro City, Laguna 4023</p>
            <p className="mt-1 text-xs text-blue-700">
              {hoveredBarangay.enterpriseCount ?? 0} registered enterprises
            </p>
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
}
