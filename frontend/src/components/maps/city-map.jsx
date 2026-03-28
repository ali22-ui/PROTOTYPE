import L from 'leaflet';
import 'leaflet.heat';
import { useEffect, useMemo, useState } from 'react';
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet';

const defaultCenter = { lat: 14.3413, lng: 121.0446 };
const sanPedroBounds = {
  north: 14.379,
  south: 14.274,
  east: 121.091,
  west: 120.985,
};

const mapOptions = {
  minZoom: 12.5,
  maxZoom: 17,
  maxBounds: [
    [sanPedroBounds.south, sanPedroBounds.west],
    [sanPedroBounds.north, sanPedroBounds.east],
  ],
  maxBoundsViscosity: 1.0,
};

function FitToBarangays({ fitToBarangays, barangays }) {
  const map = useMap();

  useEffect(() => {
    if (!fitToBarangays || !barangays.length) return;

    const bounds = L.latLngBounds([]);
    barangays.forEach((barangay) => {
      barangay.coordinates.forEach((point) =>
        bounds.extend([point.lat, point.lng]),
      );
    });

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [24, 24] });
    }
  }, [map, fitToBarangays, barangays]);

  return null;
}

function BarangayHeatLayer({ heatmap, showHeatmap }) {
  const map = useMap();

  useEffect(() => {
    if (!showHeatmap || !heatmap.length || !L.heatLayer) return;

    const points = heatmap.map((point) => [
      point.lat,
      point.lng,
      point.weight || 1,
    ]);

    const layer = L.heatLayer(points, {
      radius: 34,
      blur: 26,
      minOpacity: 0.28,
      maxZoom: 17,
      gradient: {
        0.2: '#3b82f6',
        0.4: '#2563eb',
        0.6: '#93c5fd',
        0.8: '#fbbf24',
        1.0: '#f59e0b',
      },
    }).addTo(map);

    return () => {
      map.removeLayer(layer);
    };
  }, [map, heatmap, showHeatmap]);

  return null;
}

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
  const [hoveredBarangay, setHoveredBarangay] = useState(null);

  const getPolygonCenter = (barangay) => {
    if (barangay.center) return barangay.center;
    const total = barangay.coordinates.reduce(
      (acc, point) => ({ lat: acc.lat + point.lat, lng: acc.lng + point.lng }),
      { lat: 0, lng: 0 },
    );

    return {
      lat: total.lat / barangay.coordinates.length,
      lng: total.lng / barangay.coordinates.length,
    };
  };

  const pastelPalette = [
    '#b7d3f2',
    '#f9d5dc',
    '#f8eac2',
    '#d9f3dd',
    '#e6d3f9',
    '#ffd9b8',
    '#d5f0f2',
    '#f5d2ff',
    '#cfe7ff',
    '#ffeec0',
    '#d8f8ea',
    '#f9d7cd',
    '#d7d5ff',
    '#f7f4be',
    '#eed8ff',
    '#c6eef7',
  ];

  const mapBounds = useMemo(
    () => [
      [sanPedroBounds.south, sanPedroBounds.west],
      [sanPedroBounds.north, sanPedroBounds.east],
    ],
    [],
  );

  const boundaryClassName = boundaryMode
    ? 'grayscale-[0.1] contrast-[0.95]'
    : '';

  const labelIcon = (name) =>
    L.divIcon({
      className: 'barangay-label-marker',
      html: `<span style="font-size:11px;font-weight:700;color:#111827;text-shadow:0 1px 2px rgba(255,255,255,0.9)">${name.toUpperCase()}</span>`,
      iconSize: [0, 0],
    });

  return (
    <div
      className={`${className} overflow-hidden rounded-xl ${boundaryClassName}`}
    >
      <MapContainer
        zoom={zoom}
        center={center || defaultCenter}
        className="h-full w-full"
        minZoom={mapOptions.minZoom}
        maxZoom={mapOptions.maxZoom}
        maxBounds={mapBounds}
        maxBoundsViscosity={mapOptions.maxBoundsViscosity}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitToBarangays fitToBarangays={fitToBarangays} barangays={barangays} />
        <BarangayHeatLayer heatmap={heatmap} showHeatmap={showHeatmap} />

        {showPolygons &&
          barangays.map((barangay, index) => {
            const isSelected = selectedBarangay?.id === barangay.id;

            return (
              <Polygon
                key={barangay.id}
                positions={barangay.coordinates.map((point) => [
                  point.lat,
                  point.lng,
                ])}
                eventHandlers={{
                  click: () => onBarangayClick?.(barangay),
                  mouseover: () => setHoveredBarangay(barangay),
                  mouseout: () => setHoveredBarangay(null),
                }}
                pathOptions={{
                  fillColor: boundaryMode
                    ? pastelPalette[index % pastelPalette.length]
                    : isSelected
                      ? '#1d4ed8'
                      : '#60a5fa',
                  fillOpacity: boundaryMode ? 0.62 : isSelected ? 0.45 : 0.2,
                  color: boundaryMode ? '#1f2937' : '#1e3a8a',
                  opacity: 0.9,
                  weight: boundaryMode ? 1.8 : isSelected ? 3 : 2,
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
                position={[position.lat, position.lng]}
                icon={labelIcon(barangay.name)}
                interactive={false}
              />
            );
          })}

        {showBarangayMarkers &&
          barangays.map((barangay) => {
            const position = getPolygonCenter(barangay);
            return (
              <CircleMarker
                key={`marker-${barangay.id}`}
                center={[position.lat, position.lng]}
                eventHandlers={{ click: () => onBarangayClick?.(barangay) }}
                pathOptions={{
                  fillColor:
                    selectedBarangay?.id === barangay.id
                      ? '#f4b400'
                      : '#1e3a8a',
                  fillOpacity: 0.95,
                  color: '#ffffff',
                  weight: 1.8,
                }}
                radius={selectedBarangay?.id === barangay.id ? 7 : 5}
              >
                <Popup>{barangay.name}</Popup>
              </CircleMarker>
            );
          })}

        {enterpriseMarkers.map((marker) => (
          <CircleMarker
            key={marker.id}
            center={[marker.lat, marker.lng]}
            pathOptions={{
              fillColor: '#f4b400',
              fillOpacity: 0.95,
              color: '#0b1f52',
              weight: 1.5,
            }}
            radius={5}
          >
            <Popup>{marker.name}</Popup>
          </CircleMarker>
        ))}

        {hoveredBarangay && (
          <Popup
            position={[
              getPolygonCenter(hoveredBarangay).lat,
              getPolygonCenter(hoveredBarangay).lng,
            ]}
            eventHandlers={{
              remove: () => setHoveredBarangay(null),
            }}
          >
            <div className="min-w-[180px] p-1 text-slate-800">
              <p className="text-sm font-semibold">{hoveredBarangay.name}</p>
              <p className="text-xs text-slate-600">
                San Pedro City, Laguna 4023
              </p>
              <p className="mt-1 text-xs text-blue-700">
                {hoveredBarangay.enterpriseCount ?? 0} registered enterprises
              </p>
            </div>
          </Popup>
        )}
      </MapContainer>
    </div>
  );
}
