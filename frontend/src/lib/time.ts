/** Minutes east of UTC (India = 330). The backend uses it so days and streaks roll over at the user's midnight. */
export const localTzOffsetMinutes = () => -new Date().getTimezoneOffset()
