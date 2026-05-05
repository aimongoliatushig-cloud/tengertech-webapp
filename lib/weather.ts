export type WeatherSnapshot = {
  city: string;
  temperature: number | null;
  condition: string;
  aqi: number | null;
  aqiLabel: string;
  windSpeed: number | null;
  observedAt: string | null;
  weeklyForecast: WeatherForecastDay[];
};

export type WeatherForecastDay = {
  date: string;
  weekday: string;
  condition: string;
  temperatureMax: number | null;
  temperatureMin: number | null;
  precipitationChance: number | null;
};

const ULAANBAATAR_COORDS = {
  latitude: 47.9189,
  longitude: 106.9176,
};
const ULAANBAATAR_TIME_ZONE = "Asia/Ulaanb\x61\x61t\x61r";
const WEATHER_REQUEST_TIMEOUT_MS = 10_000;
const AIR_QUALITY_REQUEST_TIMEOUT_MS = 5_000;

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
  weatherUrl.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max");
  weatherUrl.searchParams.set("timezone", ULAANBAATAR_TIME_ZONE);
  weatherUrl.searchParams.set("forecast_days", "7");

  const airUrl = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  airUrl.searchParams.set("latitude", String(ULAANBAATAR_COORDS.latitude));
  airUrl.searchParams.set("longitude", String(ULAANBAATAR_COORDS.longitude));
  airUrl.searchParams.set("current", "us_aqi");
  airUrl.searchParams.set("timezone", ULAANBAATAR_TIME_ZONE);

  const fallback: WeatherSnapshot = {
    city: "Улаанбаатар",
    temperature: null,
    condition: "Шинэчилж байна",
    aqi: null,
    aqiLabel: "AQI",
    windSpeed: null,
    observedAt: null,
    weeklyForecast: [],
  };

  try {
    const weatherResponse = await fetch(weatherUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(WEATHER_REQUEST_TIMEOUT_MS),
    });

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
      daily?: {
        time?: string[];
        weather_code?: number[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_probability_max?: number[];
      };
    };
    const air = await fetch(airUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(AIR_QUALITY_REQUEST_TIMEOUT_MS),
    })
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{ current?: { us_aqi?: number } }>)
          : null,
      )
      .catch(() => null);
    const currentWeather = weather.current;
    const aqi = air?.current?.us_aqi ?? null;
    const daily = weather.daily;
    const weeklyForecast =
      daily?.time?.slice(0, 7).map((date, index) => ({
        date,
        weekday: new Intl.DateTimeFormat("mn-MN", {
          timeZone: ULAANBAATAR_TIME_ZONE,
          weekday: "short",
        }).format(new Date(`${date}T12:00:00+08:00`)),
        condition: weatherCodeLabel(daily.weather_code?.[index]),
        temperatureMax:
          typeof daily.temperature_2m_max?.[index] === "number"
            ? Math.round(daily.temperature_2m_max[index])
            : null,
        temperatureMin:
          typeof daily.temperature_2m_min?.[index] === "number"
            ? Math.round(daily.temperature_2m_min[index])
            : null,
        precipitationChance:
          typeof daily.precipitation_probability_max?.[index] === "number"
            ? Math.round(daily.precipitation_probability_max[index])
            : null,
      })) ?? [];

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
      weeklyForecast,
    };
  } catch (error) {
    console.warn("Live weather could not be loaded:", error);
    return fallback;
  }
}
