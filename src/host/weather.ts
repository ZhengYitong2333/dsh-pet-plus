/** 天气/节日：免 key 的 Open-Meteo + 本地节日表；缓存 30 分钟。 */
const CACHE_MS = 30 * 60_000;
const WMO: Record<number, string> = {
  0: '晴', 1: '多云', 2: '多云', 3: '阴', 45: '雾', 48: '雾凇',
  51: '毛毛雨', 53: '毛毛雨', 55: '毛毛雨', 61: '小雨', 63: '中雨', 65: '大雨',
  71: '小雪', 73: '中雪', 75: '大雪', 80: '阵雨', 81: '阵雨', 82: '强阵雨',
  95: '雷阵雨', 96: '雷阵雨', 99: '强雷暴',
};

export interface WeatherResult {
  ok: boolean;
  city?: string;
  temperature?: number;
  apparent?: number;
  description?: string;
  max?: number;
  min?: number;
  rain?: number;
  message?: string;
}

let cache: { at: number; city: string; data: WeatherResult } | undefined;

export async function getWeather(city: string): Promise<WeatherResult> {
  const name = String(city ?? '').trim();
  if (!name) return { ok: false, message: '未配置城市（设置 → 陪伴 → 天气城市）' };
  if (cache && cache.city === name && Date.now() - cache.at < CACHE_MS) return cache.data;
  try {
    const geo = (await fetch(
      'https://geocoding-api.open-meteo.com/v1/search?count=1&language=zh&name=' + encodeURIComponent(name),
      { signal: AbortSignal.timeout(8000) },
    ).then((r) => r.json())) as { results?: Array<{ latitude: number; longitude: number; name: string }> };
    const place = geo.results?.[0];
    if (!place) return { ok: false, message: '找不到城市：' + name };
    const forecast = (await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
        '&current=temperature_2m,apparent_temperature,weather_code' +
        '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1',
      { signal: AbortSignal.timeout(8000) },
    ).then((r) => r.json())) as {
      current?: { temperature_2m?: number; apparent_temperature?: number; weather_code?: number };
      daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: number[] };
    };
    const data: WeatherResult = {
      ok: true,
      city: place.name,
      temperature: forecast.current?.temperature_2m,
      apparent: forecast.current?.apparent_temperature,
      description: WMO[forecast.current?.weather_code ?? -1] ?? '未知',
      max: forecast.daily?.temperature_2m_max?.[0],
      min: forecast.daily?.temperature_2m_min?.[0],
      rain: forecast.daily?.precipitation_probability_max?.[0],
    };
    cache = { at: Date.now(), city: name, data };
    return data;
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

/** 固定公历节日 + 简单节气占位（农历/节气后续接 Intl）。 */
const FESTIVALS: Array<[string, string, string]> = [
  ['01-01', '元旦', '新年第一天'],
  ['02-14', '情人节', '别忘了表达心意'],
  ['03-08', '妇女节', '向身边的女性问好'],
  ['05-01', '劳动节', '放假也别太累'],
  ['06-01', '儿童节', '可以理直气壮地幼稚一天'],
  ['10-01', '国庆节', '假期快乐'],
  ['12-25', '圣诞节', 'Merry Christmas'],
];

export function festivalOf(now = new Date()): { date: string; name?: string; note?: string; weekday: string } {
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const key = mm + '-' + dd;
  const hit = FESTIVALS.find(([d]) => d === key);
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return {
    date: `${now.getFullYear()}-${mm}-${dd}`,
    name: hit?.[1],
    note: hit?.[2],
    weekday: weekdays[now.getDay()],
  };
}
