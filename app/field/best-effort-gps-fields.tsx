"use client";

import { useEffect, useState } from "react";

type Coordinates = {
  latitude: number;
  longitude: number;
};

let cachedCoordinates: Coordinates | null = null;
let cachedUnavailable = false;
let pendingCoordinatesPromise: Promise<Coordinates | null> | null = null;

function requestCoordinates() {
  if (cachedCoordinates) {
    return Promise.resolve(cachedCoordinates);
  }

  if (cachedUnavailable || typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }

  if (!pendingCoordinatesPromise) {
    pendingCoordinatesPromise = new Promise<Coordinates | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          cachedCoordinates = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          resolve(cachedCoordinates);
        },
        () => {
          cachedUnavailable = true;
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 60_000,
          timeout: 8_000,
        },
      );
    }).finally(() => {
      pendingCoordinatesPromise = null;
    });
  }

  return pendingCoordinatesPromise;
}

export function BestEffortGpsFields() {
  const [coordinates, setCoordinates] = useState<Coordinates | null>(cachedCoordinates);
  const [status, setStatus] = useState<"idle" | "ready" | "unavailable">(
    cachedCoordinates ? "ready" : "idle",
  );

  useEffect(() => {
    let mounted = true;

    requestCoordinates().then((value) => {
      if (!mounted) {
        return;
      }
      if (value) {
        setCoordinates(value);
        setStatus("ready");
        return;
      }
      setStatus("unavailable");
    });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <>
      <input
        type="hidden"
        name="latitude"
        value={coordinates ? String(coordinates.latitude) : ""}
      />
      <input
        type="hidden"
        name="longitude"
        value={coordinates ? String(coordinates.longitude) : ""}
      />
      <small>
        {status === "ready"
          ? "GPS байршил боломжтой үед автоматаар хавсарна."
          : "GPS нь заавал биш бөгөөд төхөөрөмж өгөхгүй бол алгасагдана."}
      </small>
    </>
  );
}
