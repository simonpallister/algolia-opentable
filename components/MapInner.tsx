"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import type { Restaurant } from "@/types/restaurant";

// Teardrop marker matching the design's brand-colored pin (a rotated
// rounded square), built as a divIcon rather than Leaflet's default marker
// image - sidesteps the classic Webpack/Next broken-default-icon-path
// problem entirely, since no external icon asset is loaded.
const pinIcon = L.divIcon({
  className: "",
  html:
    '<div style="width:14px;height:14px;border-radius:50% 50% 50% 0;' +
    "background:oklch(0.55 0.17 35);transform:rotate(-45deg);" +
    'box-shadow:0 2px 4px rgba(0,0,0,0.25);"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 14],
});

const US_CENTER: [number, number] = [39.8283, -98.5795];

/** Re-fits the viewport to the current result set whenever it changes. */
function FitToHits({ hits }: { hits: Restaurant[] }) {
  const map = useMap();

  useEffect(() => {
    const points = hits
      .filter((hit) => hit._geoloc)
      .map((hit): [number, number] => [hit._geoloc.lat, hit._geoloc.lng]);

    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 14 });
  }, [map, hits]);

  return null;
}

export default function MapInner({
  hits,
  fallbackCenter,
  onSelectRestaurant,
}: {
  hits: Restaurant[];
  fallbackCenter?: { lat: number; lng: number };
  onSelectRestaurant: (restaurant: Restaurant) => void;
}) {
  const initialCenter = useMemo<[number, number]>(
    () => (fallbackCenter ? [fallbackCenter.lat, fallbackCenter.lng] : US_CENTER),
    [fallbackCenter]
  );

  return (
    <MapContainer
      center={initialCenter}
      zoom={fallbackCenter ? 12 : 4}
      scrollWheelZoom={false}
      style={{ width: "100%", height: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitToHits hits={hits} />
      {hits
        .filter((hit) => hit._geoloc)
        .map((hit) => (
          <Marker
            key={hit.objectID}
            position={[hit._geoloc.lat, hit._geoloc.lng]}
            icon={pinIcon}
            eventHandlers={{ click: () => onSelectRestaurant(hit) }}
          >
            <Tooltip direction="top" offset={[0, -12]}>
              {hit.name}
            </Tooltip>
          </Marker>
        ))}
    </MapContainer>
  );
}
