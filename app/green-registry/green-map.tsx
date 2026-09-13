"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

import type { GreenRegistryLocation } from "@/lib/green-registry";
import styles from "./green-registry.module.css";

const DEFAULT_CENTER: [number, number] = [47.88, 106.86];

export function GreenRegistryMap({ locations }: { locations: GreenRegistryLocation[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    (async () => {
      const L = (await import("leaflet")).default;
      if (disposed || !containerRef.current) return;
      const points = locations.filter((item) => item.latitude && item.longitude);
      const map = L.map(containerRef.current, { center: DEFAULT_CENTER, zoom: 12, scrollWheelZoom: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      points.forEach((point) => {
        const icon = L.divIcon({ className: "", html: '<span style="display:block;width:18px;height:18px;border-radius:50%;background:#178347;border:3px solid white;box-shadow:0 0 0 2px #178347,0 2px 5px #0005"></span>', iconSize:[18,18], iconAnchor:[9,9] });
        const popup = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = point.name;
        const details = document.createElement("p");
        details.textContent = `${point.areaSize.toLocaleString("mn-MN")} ${point.areaUnit}${point.address ? ` · ${point.address}` : ""}`;
        details.style.margin = "5px 0 0";
        popup.append(title, details);
        L.marker([point.latitude, point.longitude], { icon, title: point.name }).addTo(map).bindPopup(popup);
      });
      if (points.length) map.fitBounds(L.latLngBounds(points.map((p) => [p.latitude, p.longitude] as [number,number])), { padding:[30,30], maxZoom:15 });
      cleanup = () => map.remove();
    })();
    return () => { disposed = true; cleanup?.(); };
  }, [locations]);

  return <div ref={containerRef} className={styles.mapCanvas} aria-label="Ногоон байгууламжийн байршлын газрын зураг" />;
}

export function GreenLocationPicker({ initialLatitude = 0, initialLongitude = 0 }: { initialLatitude?: number; initialLongitude?: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markerRef = useRef<import("leaflet").Marker | null>(null);
  const [position, setPosition] = useState<{ latitude:number; longitude:number } | null>(
    initialLatitude && initialLongitude ? { latitude:initialLatitude, longitude:initialLongitude } : null,
  );

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    (async () => {
      const L = (await import("leaflet")).default;
      if (disposed || !containerRef.current) return;
      const initialPosition = initialLatitude && initialLongitude ? { latitude:initialLatitude, longitude:initialLongitude } : null;
      const center: [number,number] = initialPosition ? [initialPosition.latitude, initialPosition.longitude] : DEFAULT_CENTER;
      const map = L.map(containerRef.current, { center, zoom: initialPosition ? 16 : 12, scrollWheelZoom: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution:'&copy; OpenStreetMap', maxZoom:19 }).addTo(map);
      if (initialPosition) markerRef.current = L.marker(center).addTo(map);
      map.on("click", (event: import("leaflet").LeafletMouseEvent) => {
        const next = { latitude:Number(event.latlng.lat.toFixed(7)), longitude:Number(event.latlng.lng.toFixed(7)) };
        setPosition(next);
        if (markerRef.current) markerRef.current.setLatLng(event.latlng);
        else markerRef.current = L.marker(event.latlng).addTo(map);
      });
      cleanup = () => map.remove();
    })();
    return () => { disposed = true; cleanup?.(); markerRef.current = null; };
  }, [initialLatitude, initialLongitude]);

  return <div className={styles.picker}>
    <input type="hidden" name="latitude" value={position?.latitude ?? ""}/>
    <input type="hidden" name="longitude" value={position?.longitude ?? ""}/>
    <div ref={containerRef} className={`${styles.mapCanvas} ${styles.pickerMap}`} aria-label="GPS цэг сонгох газрын зураг" />
    <p>{position ? `Сонгосон GPS: ${position.latitude}, ${position.longitude}` : "Газрын зураг дээр дарж GPS цэгээ сонгоно уу."}</p>
  </div>;
}
