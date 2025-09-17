export const ENDPOINTS = {
  AUTH: {
    LOGIN: '/login',
    REGISTER: '/register',
    VERIFY: '/verify',
  },
  SRT: {
    SUBTITLES: '/subtitles',
    SUBTITLE_BY_FILENAME: (filename) => `/subtitles/${filename}`,
    SUBTITLE_BY_SEQUENCE: (sequenceNumber) => `/subtitles/${sequenceNumber}`,
  }
};