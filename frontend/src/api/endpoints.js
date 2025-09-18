export const ENDPOINTS = {
  AUTH: {
    LOGIN: '/login',
    REGISTER: '/register',
    VERIFY: '/verify',
  },
  SRT: {
    SUBTITLES: '/srt/subtitles',
    SUBTITLE_BY_FILENAME: (filename) => `/srt/subtitles/${filename}`,
    SUBTITLE_BY_SEQUENCE: (sequenceNumber) => `/srt/subtitles/${sequenceNumber}`,
  }
};