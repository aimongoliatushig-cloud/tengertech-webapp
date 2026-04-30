export type WeatherSnapshot = {
  city: string;
  temperature: number | null;
  condition: string;
  aqi: number | null;
  aqiLabel: string;
  windSpeed: number | null;
  observedAt: string | null;
};

const ULAANBAATAR_COORDS = {
  latitude: 47.9189,
  longitude: 106.9176,
};
const WEATHER_REQUEST_TIMEOUT_MS = 3_500;

function weatherCodeLabel(code: number | null | undefined) {
  if (code === 0) {
    return "Цэлмэг";
  }
  if ([1, 2, 3].includes(Number(code))) {
    return "Бага үүлтэй";
  }
  if ([45, 48].includes(Number(code))) {
    return "Манантай";
  }
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(Number(code))) {
    return "Бороо орж байна";
  }
  if ([71, 73, 75, 77, 85, 86].includes(Number(code))) {
    return "Цас орж байна";
  }
  if ([95, 96, 99].includes(Number(code))) {
    return "Аянгатай";
  }
  return "Шинэчилж байна";
}

function aqiLabel(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "AQI";
  }
  if (value <= 50) {
    return "Сайн";
  }
  if (value <= 100) {
    return "Дунд";
  }
  if (value <= 150) {
    return "Мэдрэмтгий";
  }
  return "Анхаарах";
}

export async function loadUlaanbaatarWeather(): Promise<WeatherSnapshot> {
  const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
  weatherUrl.searchParams.set("latitude", String(ULAANBAATAR_COORDS.latitude));
  weatherUrl.searchParams.set("longitude", String(ULAANBAATAR_COORDS.longitude));
  weatherUrl.searchParams.set("current", "temperature_2m,weather_code,wind_speed_10m");
  weatherUrl.searchParams.set("timezone", "Asia/Ulaanbaatar");

  const airUrl = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  airUrl.searchParams.set("latitude", String(ULAANBAATAR_COORDS.latitude));
  airUrl.searchParams.set("longitude", String(ULAANBAATAR_COORDS.longitude));
  airUrl.searchParams.set("current", "us_aqi");
  airUrl.searchParams.set("timezone", "Asia/Ulaanbaatar");

  const fallback: WeatherSnapshot = {
    city: "Улаанбаатар",
    temperature: null,
    condition: "Шинэчилж байна",
    aqi: null,
    aqiLabel: "AQI",
    windSpeed: null,
    observedAt: null,
  };

  try {
    const signal = AbortSignal.timeout(WEATHER_REQUEST_TIMEOUT_MS);
    const [weatherResponse, airResponse] = await Promise.all([
      fetch(weatherUrl, { cache: "no-store", signal }),
      fetch(airUrl, { cache: "no-store", signal }),
    ]);

    if (!weatherResponse.ok) {
      throw new Error(`Weather request failed: ${weatherResponse.status}`);
    }

    const weather = (await weatherResponse.json()) as {
      current?: {
        temperature_2m?: number;
        weather_code?: number;
        wind_speed_10m?: number;
        time?: string;
      };
    };
    const air = airResponse.ok
      ? ((await airResponse.json()) as { current?: { us_aqi?: number } })
      : null;
    const currentWeather = weather.current;
    const aqi = air?.current?.us_aqi ?? null;

    return {
      city: "Улаанбаатар",
      temperature:
        typeof currentWeather?.temperature_2m === "number"
          ? Math.round(currentWeather.temperature_2m)
          : null,
      condition: weatherCodeLabel(currentWeather?.weather_code),
      aqi,
      aqiLabel: aqiLabel(aqi),
      windSpeed:
        typeof currentWeather?.wind_speed_10m === "number"
          ? Math.round(currentWeather.wind_speed_10m)
          : null,
      observedAt: currentWeather?.time ?? null,
    };
  } catch (error) {
    console.warn("Live weather could not be loaded:", error);
    return fallback;
  }
}
