// Utility for generating timezone options consistently across the app

export function getTimezoneOptions(): string[] {
  let timezoneOptions: string[] = [];
  try {
    // @ts-expect-error - Intl.supportedValuesOf may not be available in all environments
    timezoneOptions =
      typeof (Intl as any).supportedValuesOf === 'function'
        ? (Intl as any).supportedValuesOf('timeZone')
        : [];
  } catch {
    timezoneOptions = [];
  }

  if (!timezoneOptions.length) {
    timezoneOptions = [
      'UTC',
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Toronto',
      'America/Vancouver',
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
      'Asia/Tokyo',
      'Asia/Shanghai',
      'Asia/Seoul',
      'Asia/Singapore',
      'Asia/Kolkata',
      'Australia/Sydney',
    ];
  }

  return timezoneOptions;
}


